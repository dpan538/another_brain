#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_heldout_breakdown.json";
const CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25y/r25y_replayable_checkpoint.json";
const HELDOUT_SEQUENCES_PATH = "artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_sequences.json";
const HELDOUT_JSONL_PATH = "training/llm_corpus/r25l_heldout.jsonl";
const R25S_BREAKDOWN_PATH = "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json";
const R25V_BREAKDOWN_PATH = "artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_heldout_breakdown.json";

const REVIEW_BUCKETS = {
  language: ["zh", "mixed", "en"],
  task_type: ["release_packaging_boundary", "toy_training_boundary", "verify_draft"],
  task_family: ["from_scratch_training_direction"]
};

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

async function readJsonIfPresent(path) {
  return (await exists(path)) ? readJson(path) : null;
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

function getBucket(map, key) {
  const normalized = String(key || "unknown");
  if (!map[normalized]) map[normalized] = emptyBucket();
  return map[normalized];
}

function addToBucket(bucket, lossRow, tokenStats) {
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

function addStructuralToBucket(bucket, tokenStats) {
  bucket.sequence_count += 1;
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
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024
  });
  return JSON.parse(stdout.trim().split(/\r?\n(?=\{)/).at(-1) || stdout);
}

async function readReusableReport() {
  if (!(await exists(OUTPUT_PATH))) return null;
  const report = await readJson(OUTPUT_PATH);
  if (
    report?.ok === true &&
    report?.run_id === "r25y_data_regularized_192" &&
    report?.training_ran === false &&
    report?.heldout_loss_finite === true &&
    report?.by_language &&
    report?.by_task_type &&
    report?.by_task_family
  ) {
    return report;
  }
  return null;
}

function bucketDelta(current, previous) {
  if (!current || !previous) return null;
  const currentLoss = current.average_next_token_loss;
  const previousLoss = previous.average_next_token_loss;
  if (!finite(currentLoss) || !finite(previousLoss)) return null;
  return {
    current_loss: currentLoss,
    previous_loss: previousLoss,
    delta: currentLoss - previousLoss,
    improved: currentLoss <= previousLoss,
    current_sequence_count: current.sequence_count,
    previous_sequence_count: previous.sequence_count
  };
}

function reviewBucketDeltas(report, previous) {
  const out = {};
  for (const language of REVIEW_BUCKETS.language) {
    out[`language:${language}`] = bucketDelta(report.by_language?.[language], previous?.by_language?.[language]);
  }
  for (const taskType of REVIEW_BUCKETS.task_type) {
    out[`task_type:${taskType}`] = bucketDelta(report.by_task_type?.[taskType], previous?.by_task_type?.[taskType]);
  }
  for (const family of REVIEW_BUCKETS.task_family) {
    out[`task_family:${family}`] = bucketDelta(report.by_task_family?.[family], previous?.by_task_family?.[family]);
  }
  return out;
}

function appendNote(notes, note) {
  const next = [...(notes || [])];
  if (!next.includes(note)) next.push(note);
  return next;
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
      notes: ["R25Y held-out breakdown is skipped because local ignored replay artifacts are absent."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const reusable = await readReusableReport();
  if (reusable) {
    reusable.reused_existing_report = true;
    reusable.notes = appendNote(reusable.notes, "Reused the existing ignored R25Z breakdown report for this routine no-training gate.");
    await writeJson(OUTPUT_PATH, reusable);
    console.log(JSON.stringify(reusable, null, 2));
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

  let replay = null;
  try {
    replay = await replaySequenceLosses();
  } catch (error) {
    const retryReusable = await readReusableReport();
    if (retryReusable) {
      retryReusable.reused_existing_report = true;
      retryReusable.notes = appendNote(retryReusable.notes, `Reused existing report after replay failure: ${String(error?.message || error)}`);
      await writeJson(OUTPUT_PATH, retryReusable);
      console.log(JSON.stringify(retryReusable, null, 2));
      return;
    }
    const heldoutEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json");
    const structuralByLanguage = {};
    const structuralByTaskType = {};
    const structuralByFamily = {};
    const structuralByPolicyTag = {};
    for (const sequence of heldoutDataset.sequences) {
      const row = rowById.get(sequence.sample_id) || {};
      const stats = tokenStats(sequence, padId, unkId);
      addStructuralToBucket(getBucket(structuralByLanguage, row.language), stats);
      addStructuralToBucket(getBucket(structuralByTaskType, row.task_type), stats);
      addStructuralToBucket(getBucket(structuralByFamily, row.task_family || row.family), stats);
      for (const tag of row.policy_tags || []) {
        addStructuralToBucket(getBucket(structuralByPolicyTag, tag), stats);
      }
    }
    const structuralReport = {
      ok: true,
      skipped: false,
      run_id: "r25y_data_regularized_192",
      training_ran: false,
      heldout_sequences: heldoutDataset.sequences.length,
      heldout_loss: heldoutEval?.heldout_loss ?? null,
      heldout_loss_finite: finite(heldoutEval?.heldout_loss),
      bucket_loss_available: false,
      bucket_loss_unavailable_reason: "sequence_loss_replay_timeout",
      by_language: finalizeBuckets(structuralByLanguage),
      by_task_type: finalizeBuckets(structuralByTaskType),
      by_task_family: finalizeBuckets(structuralByFamily),
      by_policy_tag: finalizeBuckets(structuralByPolicyTag),
      review_bucket_deltas_vs_r25s: {},
      review_bucket_deltas_vs_r25v: {},
      notes: [
        "R25Y structural breakdown does not train.",
        "Per-sequence replay did not finish within the routine gate timeout, so bucket average losses are intentionally null.",
        "The aggregate held-out loss is reused from the existing ignored R25Y held-out replay report."
      ],
      replay_error: String(error?.message || error)
    };
    await writeJson(OUTPUT_PATH, structuralReport);
    console.log(JSON.stringify(structuralReport, null, 2));
    return;
  }

  const byLanguage = {};
  const byTaskType = {};
  const byFamily = {};
  const byPolicyTag = {};
  const sequenceLosses = replay.sequence_losses || [];

  for (let index = 0; index < heldoutDataset.sequences.length; index += 1) {
    const sequence = heldoutDataset.sequences[index];
    const row = rowById.get(sequence.sample_id) || {};
    const lossRow = sequenceLosses[index] || {};
    const stats = tokenStats(sequence, padId, unkId);
    addToBucket(getBucket(byLanguage, row.language), lossRow, stats);
    addToBucket(getBucket(byTaskType, row.task_type), lossRow, stats);
    addToBucket(getBucket(byFamily, row.task_family || row.family), lossRow, stats);
    for (const tag of row.policy_tags || []) {
      addToBucket(getBucket(byPolicyTag, tag), lossRow, stats);
    }
  }

  const report = {
    ok: true,
    skipped: false,
    run_id: "r25y_data_regularized_192",
    training_ran: false,
    heldout_sequences: heldoutDataset.sequences.length,
    heldout_loss: replay.heldout_loss ?? replay.loss ?? null,
    heldout_loss_finite: finite(replay.heldout_loss ?? replay.loss),
    by_language: finalizeBuckets(byLanguage),
    by_task_type: finalizeBuckets(byTaskType),
    by_task_family: finalizeBuckets(byFamily),
    by_policy_tag: finalizeBuckets(byPolicyTag),
    notes: [
      "R25Y breakdown evaluates an existing ignored replayable checkpoint and does not train.",
      "Held-out rows are from R25L heldout only."
    ]
  };
  const r25sBreakdown = await readJsonIfPresent(R25S_BREAKDOWN_PATH);
  const r25vBreakdown = await readJsonIfPresent(R25V_BREAKDOWN_PATH);
  report.review_bucket_deltas_vs_r25s = reviewBucketDeltas(report, r25sBreakdown);
  report.review_bucket_deltas_vs_r25v = reviewBucketDeltas(report, r25vBreakdown);

  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.heldout_loss_finite) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
