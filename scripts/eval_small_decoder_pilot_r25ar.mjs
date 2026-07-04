#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25ar.json";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.json";
const OUTPUT_DIR = "artifacts/training_os/small_decoder_pilot/r25ar/";
const RUN_REPORT_PATH = `${OUTPUT_DIR}r25ar_small_decoder_run_report.json`;
const DATASET_REPORT_PATH = `${OUTPUT_DIR}r25ar_dataset_report.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}r25ar_replayable_checkpoint.json`;
const EVAL_REPORT_PATH = `${OUTPUT_DIR}r25ar_small_decoder_eval_report.json`;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const FORBIDDEN_OUTPUT_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data|BEGIN PRIVATE KEY|api[_ -]?key|secret|\/Users\//i;
const REMOTE_MARKER_RE = /huggingface\.co|openai\.com|external model API|remote download|pip install|npm install/i;
const REQUIRED_RUN_ID = "r25ar_repaired_sampler_microcycle";
const REQUIRED_VARIANT_ID = "r25ar_mixed_repair_lower_intensity";

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function isIgnored(path) {
  try {
    await execFileAsync("git", ["check-ignore", path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function validateReplayableCheckpoint(checkpoint) {
  const failures = [];
  if (checkpoint.schema_version !== "r25o_small_decoder_checkpoint_v1") failures.push({ code: "checkpoint_schema_version_invalid" });
  if (checkpoint.run_id !== REQUIRED_RUN_ID) failures.push({ code: "checkpoint_run_id_invalid", actual: checkpoint.run_id });
  if (checkpoint.phase !== "phase_3_small_decoder_pilot") failures.push({ code: "checkpoint_phase_invalid", actual: checkpoint.phase });
  if (!["causal_decoder_pilot", "decoder_like_next_token_pilot", "decoder_only_transformer_pilot"].includes(checkpoint.model_type)) {
    failures.push({ code: "checkpoint_model_type_invalid", actual: checkpoint.model_type });
  }
  if (Number(checkpoint.architecture?.layers) !== 1) failures.push({ code: "checkpoint_actual_layers_must_be_one", actual: checkpoint.architecture?.layers });
  if (!Array.isArray(checkpoint.parameter_tensors) || checkpoint.parameter_tensors.length === 0) failures.push({ code: "checkpoint_missing_parameter_tensors" });
  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_product_model_true" });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_release_checkpoint_true" });
  if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_commit_allowed_true" });
  if (checkpoint.created_for !== "small_decoder_pilot_only") failures.push({ code: "checkpoint_created_for_invalid", actual: checkpoint.created_for });
  return failures;
}

function coverageComplete(coverage, targets = []) {
  return targets.every((target) => Number(coverage?.[target]?.rows || 0) > 0 && coverage?.[target]?.fabricated === false);
}

async function main() {
  const failures = [];
  const config = await readJson(CONFIG_PATH);
  const approval = await readJson(APPROVAL_PATH).catch(() => null);
  const datasetReport = await readJson(DATASET_REPORT_PATH).catch(() => null);
  const runReport = await readJson(RUN_REPORT_PATH).catch(() => null);
  const checkpoint = await readJson(CHECKPOINT_PATH).catch(() => null);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", OUTPUT_DIR]);
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));
  const target = config.sampler_target || config.language_mix_target || {};

  if (config.run_id !== REQUIRED_RUN_ID || config.variant_id !== REQUIRED_VARIANT_ID) {
    failures.push({ code: "r25ar_config_variant_mismatch", run_id: config.run_id, variant_id: config.variant_id });
  }
  if (config.phase_4_scaled_training !== false) failures.push({ code: "r25ar_config_phase_4_must_be_false" });
  if (config.product_model !== false || config.release_checkpoint !== false) failures.push({ code: "r25ar_config_product_or_release_enabled" });
  if (config.formal_decoder_training !== false || config.formal_product_training !== false || config.long_term_training !== false) {
    failures.push({ code: "r25ar_config_formal_or_long_training_enabled" });
  }
  if (config.tokenizer_dry_run_allowed === true || config.allow_tokenizer_dry_run === true) failures.push({ code: "r25ar_config_tokenizer_dry_run_enabled" });
  if (config.corpus_expansion_allowed === true || config.allow_corpus_expansion === true) failures.push({ code: "r25ar_config_corpus_expansion_enabled" });
  if (Number(config.architecture?.layers) !== 1) failures.push({ code: "r25ar_config_must_keep_one_layer_baseline", actual: config.architecture?.layers });
  if (Number(target.zh_min) < 0.65 || Number(target.mixed_target) < 0.24 || Number(target.en_max) > 0.1) failures.push({ code: "r25ar_language_target_invalid", target });
  if (!Array.isArray(config.train_sources) || !Array.isArray(config.dev_sources) || !Array.isArray(config.heldout_sources)) failures.push({ code: "r25ar_sources_must_be_split_arrays" });
  if (!datasetReport?.ok) failures.push({ code: "r25ar_dataset_report_missing_or_not_ok" });
  if (!runReport) failures.push({ code: "r25ar_run_report_missing", path: RUN_REPORT_PATH });
  if (runReport?.small_pilot_training_ran === true && !checkpoint) failures.push({ code: "r25ar_replayable_checkpoint_missing", path: CHECKPOINT_PATH });
  if (approval?.consumed !== true) failures.push({ code: "r25ar_approval_not_consumed" });
  if (approval?.allow_additional_runs !== false) failures.push({ code: "r25ar_approval_allows_additional_runs" });
  if (approval?.allow_weight_commit !== false) failures.push({ code: "r25ar_approval_allows_weight_commit" });
  if (approval?.allow_product_model_training !== false) failures.push({ code: "r25ar_approval_allows_product_training" });
  if (approval?.allow_long_term_training !== false) failures.push({ code: "r25ar_approval_allows_long_term_training" });
  if (approval?.allow_phase_4_scaled_training !== false) failures.push({ code: "r25ar_approval_allows_phase_4_scaled_training" });
  if (approval?.allow_release_checkpoint !== false) failures.push({ code: "r25ar_approval_allows_release_checkpoint" });
  if (approval?.allow_tokenizer_dry_run !== false) failures.push({ code: "r25ar_approval_allows_tokenizer_dry_run" });
  if (approval?.allow_corpus_expansion !== false) failures.push({ code: "r25ar_approval_allows_corpus_expansion" });

  if (runReport) {
    if (runReport.skipped === true && runReport.small_pilot_training_ran === false) {
      if (!runReport.reason) failures.push({ code: "r25ar_blocked_without_explicit_reason" });
    } else {
      if (runReport.ok !== true) failures.push({ code: "r25ar_run_report_not_ok" });
      if (runReport.run_id !== REQUIRED_RUN_ID) failures.push({ code: "r25ar_run_id_invalid", actual: runReport.run_id });
      if (runReport.variant_id !== REQUIRED_VARIANT_ID) failures.push({ code: "r25ar_variant_id_invalid", actual: runReport.variant_id });
      if (runReport.small_pilot_training_ran !== true) failures.push({ code: "r25ar_training_did_not_run_or_block" });
      if (runReport.bounded_decoder_pilot_training !== true) failures.push({ code: "r25ar_bounded_decoder_pilot_flag_missing" });
      if (runReport.repaired_sampler_microcycle !== true) failures.push({ code: "r25ar_repaired_sampler_flag_missing" });
      if (Number(runReport.actual_layers) !== 1) failures.push({ code: "r25ar_actual_layers_must_be_one", actual: runReport.actual_layers });
      if (Number(runReport.learning_rate) !== Number(config.learning_rate)) failures.push({ code: "learning_rate_mismatch", expected: config.learning_rate, actual: runReport.learning_rate });
      if (runReport.formal_decoder_training !== false || runReport.formal_product_training !== false) failures.push({ code: "formal_training_must_be_false" });
      if (runReport.tokenizer_dry_run_ran !== false) failures.push({ code: "tokenizer_dry_run_ran_must_be_false" });
      if (runReport.corpus_expansion_ran !== false) failures.push({ code: "corpus_expansion_ran_must_be_false" });
      if (runReport.long_term_training !== false || runReport.phase_4_scaled_training !== false) failures.push({ code: "long_or_phase4_training_must_be_false" });
      if (runReport.product_model !== false || runReport.release_checkpoint !== false) failures.push({ code: "product_or_release_must_be_false" });
      if (runReport.train_loss_decreased !== true || !finite(runReport.initial_train_loss) || !finite(runReport.final_train_loss)) failures.push({ code: "train_loss_did_not_decrease_or_not_finite" });
      if (runReport.dev_loss_finite !== true || !finite(runReport.initial_dev_loss) || !finite(runReport.final_dev_loss)) failures.push({ code: "dev_loss_not_finite" });
      if (!Number.isInteger(runReport.steps) || runReport.steps > Number(config.max_steps)) failures.push({ code: "pilot_steps_exceed_config", steps: runReport.steps, max_steps: config.max_steps });
      if (runReport.train_sequences !== Number(config.max_train_rows)) failures.push({ code: "train_sequence_count_mismatch", expected: config.max_train_rows, actual: runReport.train_sequences });
      if (runReport.dev_sequences !== Number(config.max_dev_rows)) failures.push({ code: "dev_sequence_count_mismatch", expected: config.max_dev_rows, actual: runReport.dev_sequences });
      if (runReport.heldout_sequences_prepared !== Number(config.max_heldout_rows)) failures.push({ code: "heldout_sequence_count_mismatch", expected: config.max_heldout_rows, actual: runReport.heldout_sequences_prepared });
      if (runReport.replayable_checkpoint_written !== true) failures.push({ code: "replayable_checkpoint_not_written" });
      if (runReport.replayable_checkpoint_path !== CHECKPOINT_PATH) failures.push({ code: "replayable_checkpoint_path_mismatch", actual: runReport.replayable_checkpoint_path });
      if (runReport.weights_tracked !== false) failures.push({ code: "run_report_claims_weights_tracked" });
      const mix = runReport.actual_language_mix || datasetReport?.actual_train_language_mix || {};
      if (Number(mix.zh || 0) < Number(target.zh_min)) failures.push({ code: "actual_train_mix_not_zh_primary", mix });
      if (Number(mix.mixed || 0) + 0.0001 < Number(target.mixed_target)) failures.push({ code: "actual_train_mix_below_mixed_target", mix });
      if (Number(mix.en || 0) > Number(target.en_max)) failures.push({ code: "actual_train_mix_exceeds_en_cap", mix });
      if (!coverageComplete(runReport.personal_target_coverage || datasetReport?.personal_target_coverage || {}, config.personal_color_targets || [])) failures.push({ code: "personal_target_coverage_incomplete" });
      if (!coverageComplete(runReport.risk_focus_target_coverage || datasetReport?.risk_focus_target_coverage || {}, config.risk_focus_targets || [])) failures.push({ code: "risk_focus_target_coverage_incomplete" });
      if (FORBIDDEN_OUTPUT_RE.test(String(runReport.sample_generation_preview || ""))) failures.push({ code: "forbidden_marker_in_generation_preview" });
      if (REMOTE_MARKER_RE.test(JSON.stringify(runReport))) failures.push({ code: "remote_or_install_marker_in_run_report" });
      for (const path of runReport.artifact_paths || []) {
        if (!String(path).startsWith(OUTPUT_DIR)) failures.push({ code: "artifact_outside_r25ar_output_dir", path });
        if (!(await exists(path))) failures.push({ code: "artifact_missing", path });
        if (!(await isIgnored(path))) failures.push({ code: "artifact_not_ignored", path });
        if (MODEL_WEIGHT_RE.test(path)) failures.push({ code: "forbidden_model_binary_artifact_extension", path });
      }
    }
  }

  if (checkpoint) {
    failures.push(...validateReplayableCheckpoint(checkpoint));
    if (!(await isIgnored(CHECKPOINT_PATH))) failures.push({ code: "checkpoint_not_ignored", path: CHECKPOINT_PATH });
  }
  if ((datasetReport?.forbidden_sources_touched || []).length) failures.push({ code: "pilot_dataset_touched_forbidden_sources", sources: datasetReport.forbidden_sources_touched });
  if (datasetReport?.split_overlap?.any_overlap === true) failures.push({ code: "train_dev_heldout_overlap_detected", overlap: datasetReport.split_overlap });
  if (trackedArtifacts.length) failures.push({ code: "pilot_artifacts_tracked_or_staged", trackedArtifacts });
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });

  const output = {
    ok: failures.length === 0,
    run_id: REQUIRED_RUN_ID,
    variant_id: REQUIRED_VARIANT_ID,
    small_pilot_training_ran: runReport?.small_pilot_training_ran === true,
    bounded_decoder_pilot_training: runReport?.bounded_decoder_pilot_training === true,
    tokenizer_dry_run_ran: false,
    corpus_expansion_ran: false,
    blocked: runReport?.skipped === true,
    blocked_reason: runReport?.skipped ? runReport.reason || null : null,
    backend: runReport?.backend || "unknown",
    actual_layers: runReport?.actual_layers ?? null,
    actual_language_mix: runReport?.actual_language_mix || datasetReport?.actual_train_language_mix || null,
    personal_target_coverage: runReport?.personal_target_coverage || datasetReport?.personal_target_coverage || null,
    risk_focus_target_coverage: runReport?.risk_focus_target_coverage || datasetReport?.risk_focus_target_coverage || null,
    train_loss_decreased: runReport?.train_loss_decreased === true,
    dev_loss_finite: runReport?.dev_loss_finite === true,
    phase_4_scaled_training: false,
    replayable_checkpoint_written: runReport?.replayable_checkpoint_written === true,
    checkpoint_validates: checkpoint ? validateReplayableCheckpoint(checkpoint).length === 0 : false,
    product_model: false,
    release_checkpoint: false,
    formal_decoder_training: false,
    formal_product_training: false,
    long_term_training: false,
    artifacts_under_ignored_path: failures.every((failure) => failure.code !== "artifact_outside_r25ar_output_dir" && failure.code !== "artifact_not_ignored"),
    weights_tracked: trackedWeights.length > 0,
    tracked_model_like_files: trackedWeights,
    eval_sources_used_for_training: false,
    failures
  };
  await writeJson(EVAL_REPORT_PATH, output);
  console.log(JSON.stringify(output, null, 2));
  if (!output.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
