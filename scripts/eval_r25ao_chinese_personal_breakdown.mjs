#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json";
const CHECKPOINT_PATH = "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_replayable_checkpoint.json";
const HELDOUT_SEQUENCES_PATH = "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_sequences.json";
const DATASET_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json";
const RUN_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json";
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25ao.json";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.json";
const TARGET = { zh_min: 0.7, mixed_target: 0.2, en_max: 0.1 };

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

function languageShare(counts) {
  const total = counts.total || 1;
  return {
    zh: (counts.zh || 0) / total,
    mixed: (counts.mixed || 0) / total,
    en: (counts.en || 0) / total,
    other: (counts.other || 0) / total
  };
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

function cachedReportIsValid(report, config, approval) {
  return report
    && report.ok === true
    && report.skipped === false
    && report.run_id === "r25ao_expanded_chinese_personal_microcycle"
    && report.training_ran === false
    && report.heldout_loss_finite === true
    && Number.isFinite(Number(report.heldout_loss))
    && Number(report.heldout_sequences || 0) > 0
    && report.product_model === false
    && report.release_checkpoint === false
    && report.phase_4_scaled_training === false
    && Array.isArray(report.failures)
    && report.failures.length === 0
    && config.run_id === "r25ao_expanded_chinese_personal_microcycle"
    && approval.consumed === true
    && approval.allow_additional_runs === false;
}

async function main() {
  const required = [CHECKPOINT_PATH, HELDOUT_SEQUENCES_PATH, DATASET_REPORT_PATH, RUN_REPORT_PATH, CONFIG_PATH, APPROVAL_PATH];
  const missing = [];
  for (const path of required) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_r25ao_artifacts_missing",
      missing,
      training_ran: false,
      product_model: false,
      release_checkpoint: false,
      phase_4_scaled_training: false,
      notes: ["R25AO breakdown is skipped because local ignored replay artifacts are absent."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const config = await readJson(CONFIG_PATH);
  const approval = await readJson(APPROVAL_PATH);
  const datasetReport = await readJson(DATASET_REPORT_PATH);
  const runReport = await readJson(RUN_REPORT_PATH);
  const heldoutDataset = await readJson(HELDOUT_SEQUENCES_PATH);
  const cachedReport = await readJsonIfPresent(OUTPUT_PATH);
  if (cachedReportIsValid(cachedReport, config, approval)) {
    const report = {
      ...cachedReport,
      cached_history_report_used: true,
      notes: [
        ...(cachedReport.notes || []),
        "This R25AO history check reused the existing ignored breakdown report instead of recomputing sequence losses."
      ]
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const tokenizer = heldoutDataset.tokenizer_path && (await exists(heldoutDataset.tokenizer_path))
    ? await readJson(heldoutDataset.tokenizer_path)
    : null;
  const padId = Number(heldoutDataset.pad_token_id || 0);
  const unkId = tokenizer?.vocab?.["<unk>"] === undefined ? null : Number(tokenizer.vocab["<unk>"]);
  const replay = await replaySequenceLosses();
  const lossesById = new Map((replay.sequence_losses || []).map((row) => [row.sample_id, row]));
  const failures = [];

  if (config.run_id !== "r25ao_expanded_chinese_personal_microcycle") failures.push({ code: "config_run_id_mismatch", actual: config.run_id });
  if (approval.consumed !== true || approval.allow_additional_runs !== false) failures.push({ code: "approval_must_be_consumed_inert" });
  if (runReport.small_pilot_training_ran !== true || runReport.expanded_chinese_personal_microcycle !== true) failures.push({ code: "r25ao_run_report_not_expanded_chinese_personal_training" });
  if (runReport.tokenizer_dry_run_ran !== false || runReport.formal_decoder_training !== false) failures.push({ code: "r25ao_run_report_forbidden_training_mode" });
  if (replay.ok !== true || replay.heldout_loss_finite !== true) failures.push({ code: "heldout_replay_not_finite", replay });
  if (heldoutDataset.split !== "heldout" || heldoutDataset.not_used_for_training !== true) failures.push({ code: "heldout_sequences_not_eval_only" });

  const byLanguage = {};
  const byTaskType = {};
  const byTaskFamily = {};
  const byPersonalTarget = {};
  const byPolicyTag = {};

  for (const sequence of heldoutDataset.sequences || []) {
    const lossRow = lossesById.get(sequence.sample_id);
    if (!lossRow) failures.push({ code: "heldout_loss_missing", sample_id: sequence.sample_id });
    const stats = tokenStats(sequence, padId, unkId);
    addToBucket(getBucket(byLanguage, sequence.language), lossRow, stats);
    addToBucket(getBucket(byTaskType, sequence.task_type), lossRow, stats);
    addToBucket(getBucket(byTaskFamily, sequence.task_family), lossRow, stats);
    for (const target of sequence.personal_targets || ["none"]) addToBucket(getBucket(byPersonalTarget, target), lossRow, stats);
    for (const tag of sequence.policy_tags || ["unknown"]) addToBucket(getBucket(byPolicyTag, tag), lossRow, stats);
  }

  const actualMix = runReport.actual_language_mix || datasetReport.actual_train_language_mix || {};
  if (Number(actualMix.zh || 0) < TARGET.zh_min) failures.push({ code: "train_mix_not_chinese_primary", actualMix });
  if (Number(actualMix.en || 0) > TARGET.en_max) failures.push({ code: "train_mix_exceeds_english_cap", actualMix });

  const coverage = runReport.personal_target_coverage || datasetReport.personal_target_coverage || {};
  const missingTargets = (config.personal_color_targets || []).filter((target) => Number(coverage[target]?.rows || 0) <= 0);
  if (missingTargets.length) failures.push({ code: "personal_targets_undercovered", missingTargets });

  const heldoutLanguageCounts = datasetReport.heldout_language_counts || { total: heldoutDataset.sequences?.length || 0 };
  const report = {
    ok: failures.length === 0,
    skipped: false,
    run_id: "r25ao_expanded_chinese_personal_microcycle",
    variant_id: "r25ao_sampler_zh70_mixed20_en10",
    training_ran: false,
    bounded_decoder_pilot_training_ran_once: runReport.small_pilot_training_ran === true,
    tokenizer_dry_run_ran: false,
    heldout_sequences: heldoutDataset.sequences?.length || 0,
    heldout_loss: replay.heldout_loss,
    heldout_loss_finite: replay.heldout_loss_finite === true,
    target_language_mix: config.sampler_target || config.language_mix_target,
    actual_train_language_mix: actualMix,
    heldout_language_counts: heldoutLanguageCounts,
    heldout_language_share: languageShare(heldoutLanguageCounts),
    by_language: finalizeBuckets(byLanguage),
    by_task_type: finalizeBuckets(byTaskType),
    by_task_family: finalizeBuckets(byTaskFamily),
    by_personal_target: finalizeBuckets(byPersonalTarget),
    by_policy_tag: finalizeBuckets(byPolicyTag),
    personal_target_coverage: coverage,
    personal_targets_undercovered: missingTargets,
    token_coverage: {
      pad_token_id: padId,
      unk_token_id: unkId,
      known_token_definition: unkId === null ? "non-pad tokens" : "non-pad and non-unk tokens"
    },
    product_model: false,
    release_checkpoint: false,
    formal_decoder_training: false,
    formal_product_training: false,
    long_term_training: false,
    phase_4_scaled_training: false,
    failures,
    notes: [
      "R25AO breakdown replays an existing ignored pilot checkpoint and does not train.",
      "The report is structural: it measures heldout replay loss by language and project/personal labels without using heldout text for training.",
      "R25AO remains a phase_3 bounded pilot, not product/formal/phase_4 training."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
