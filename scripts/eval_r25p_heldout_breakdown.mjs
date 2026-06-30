#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const OUTPUT_DIR = "artifacts/training_os/small_decoder_pilot/r25q/";
const OUTPUT_PATH = `${OUTPUT_DIR}r25q_heldout_breakdown.json`;
const CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_replayable_checkpoint.json";
const HELDOUT_SEQUENCES_PATH = "artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_sequences.json";
const HELDOUT_JSONL_PATH = "training/llm_corpus/r25l_heldout.jsonl";

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function readJsonl(path) {
  const text = await readFile(resolve(ROOT, path), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function emptyBucket() {
  return {
    sequence_count: 0,
    pair_count: 0,
    weighted_loss_sum: 0,
    token_count: 0,
    known_token_count: 0,
    finite_loss_status: true
  };
}

function addToBucket(bucket, row, lossRow, tokenStats) {
  bucket.sequence_count += 1;
  bucket.pair_count += Number(lossRow?.pairs || 0);
  if (finite(lossRow?.loss) && Number(lossRow?.pairs || 0) > 0) {
    bucket.weighted_loss_sum += Number(lossRow.loss) * Number(lossRow.pairs);
  } else {
    bucket.finite_loss_status = false;
  }
  bucket.token_count += tokenStats.token_count;
  bucket.known_token_count += tokenStats.known_token_count;
}

function finalizeBuckets(map) {
  const out = {};
  for (const [key, bucket] of Object.entries(map)) {
    out[key] = {
      sequence_count: bucket.sequence_count,
      pair_count: bucket.pair_count,
      finite_loss_status: bucket.finite_loss_status,
      average_next_token_loss: bucket.pair_count > 0 ? bucket.weighted_loss_sum / bucket.pair_count : null,
      token_count: bucket.token_count,
      known_token_count: bucket.known_token_count,
      known_token_rate: bucket.token_count > 0 ? bucket.known_token_count / bucket.token_count : null
    };
  }
  return out;
}

function getBucket(map, key) {
  const normalized = String(key || "unknown");
  if (!map[normalized]) map[normalized] = emptyBucket();
  return map[normalized];
}

function tokenStats(sequence, padId, unkId) {
  let token_count = 0;
  let known_token_count = 0;
  for (const token of sequence.token_ids || []) {
    if (Number(token) === padId) continue;
    token_count += 1;
    if (unkId === null || Number(token) !== unkId) known_token_count += 1;
  }
  return { token_count, known_token_count };
}

async function replaySequenceLosses() {
  const { stdout } = await execFileAsync("python3", [
    "scripts/eval_small_decoder_replay_heldout.py",
    "--checkpoint",
    CHECKPOINT_PATH,
    "--heldout",
    HELDOUT_SEQUENCES_PATH,
    "--emit-sequence-losses"
  ], {
    cwd: ROOT,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024
  });
  return JSON.parse(stdout.trim().split(/\r?\n(?=\{)/).at(-1) || stdout);
}

async function main() {
  const required = [CHECKPOINT_PATH, HELDOUT_SEQUENCES_PATH, HELDOUT_JSONL_PATH];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      training_ran: false,
      notes: ["Heldout breakdown is skipped because the local ignored R25P replay artifacts are absent."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const heldoutDataset = await readJson(HELDOUT_SEQUENCES_PATH);
  const heldoutRows = await readJsonl(HELDOUT_JSONL_PATH);
  const tokenizer = heldoutDataset.tokenizer_path && (await exists(heldoutDataset.tokenizer_path))
    ? await readJson(heldoutDataset.tokenizer_path)
    : null;
  const padId = Number(heldoutDataset.pad_token_id || 0);
  const unkId = tokenizer?.vocab?.["<unk>"] === undefined ? null : Number(tokenizer.vocab["<unk>"]);
  const rowById = new Map(heldoutRows.map((row) => [row.sample_id, row]));
  const replay = await replaySequenceLosses();
  const lossesById = new Map((replay.sequence_losses || []).map((row) => [row.sample_id, row]));
  const failures = [];
  if (replay.ok !== true || replay.heldout_loss_finite !== true) failures.push({ code: "heldout_replay_not_finite", replay });
  if (heldoutDataset.split !== "heldout" || heldoutDataset.not_used_for_training !== true) failures.push({ code: "heldout_sequences_not_eval_only" });

  const byLanguage = {};
  const byTaskType = {};
  const byTaskFamily = {};
  const byPolicyTag = {};

  for (const sequence of heldoutDataset.sequences || []) {
    const row = rowById.get(sequence.sample_id);
    const lossRow = lossesById.get(sequence.sample_id);
    if (!row) failures.push({ code: "heldout_metadata_missing", sample_id: sequence.sample_id });
    if (!lossRow) failures.push({ code: "heldout_loss_missing", sample_id: sequence.sample_id });
    const stats = tokenStats(sequence, padId, unkId);
    addToBucket(getBucket(byLanguage, row?.language), row, lossRow, stats);
    addToBucket(getBucket(byTaskType, row?.task_type), row, lossRow, stats);
    addToBucket(getBucket(byTaskFamily, row?.task_family), row, lossRow, stats);
    for (const tag of row?.policy_tags || ["unknown"]) {
      addToBucket(getBucket(byPolicyTag, tag), row, lossRow, stats);
    }
  }

  const report = {
    ok: failures.length === 0,
    skipped: false,
    run_id: "r25p_more_sequences_128",
    training_ran: false,
    heldout_sequences: heldoutDataset.sequences?.length || 0,
    heldout_loss: replay.heldout_loss,
    heldout_loss_finite: replay.heldout_loss_finite === true,
    by_language: finalizeBuckets(byLanguage),
    by_task_type: finalizeBuckets(byTaskType),
    by_task_family: finalizeBuckets(byTaskFamily),
    by_policy_tag: finalizeBuckets(byPolicyTag),
    token_coverage: {
      pad_token_id: padId,
      unk_token_id: unkId,
      known_token_definition: unkId === null ? "non-pad tokens" : "non-pad and non-unk tokens"
    },
    product_model: false,
    release_checkpoint: false,
    notes: [
      "Breakdown uses R25L heldout rows and the existing ignored R25P checkpoint only.",
      "No training is performed.",
      "Average losses are weighted by next-token pair count within each group."
    ],
    failures
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
