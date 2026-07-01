#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25v.json";
const APPROVAL_PATH = "training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json";
const OUTPUT_DIR = "artifacts/training_os/small_decoder_pilot/r25v/";
const RUN_REPORT_PATH = `${OUTPUT_DIR}r25v_small_decoder_run_report.json`;
const DATASET_REPORT_PATH = `${OUTPUT_DIR}r25v_dataset_report.json`;
const CHECKPOINT_PATH = `${OUTPUT_DIR}r25v_replayable_checkpoint.json`;
const EVAL_REPORT_PATH = `${OUTPUT_DIR}r25v_small_decoder_eval_report.json`;
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const FORBIDDEN_OUTPUT_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data|BEGIN PRIVATE KEY|api[_ -]?key|secret/i;
const REMOTE_MARKER_RE = /huggingface\.co|openai\.com|external model API|remote download|pip install|npm install/i;

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
  if (checkpoint.run_id !== "r25v_two_layer_same_width") failures.push({ code: "checkpoint_run_id_invalid", actual: checkpoint.run_id });
  if (checkpoint.phase !== "phase_3_small_decoder_pilot") failures.push({ code: "checkpoint_phase_invalid", actual: checkpoint.phase });
  if (checkpoint.model_type !== "causal_decoder_pilot") failures.push({ code: "checkpoint_model_type_must_be_causal_decoder_pilot", actual: checkpoint.model_type });
  if (checkpoint.architecture?.ablation !== "two_layer_same_width") failures.push({ code: "checkpoint_ablation_invalid", actual: checkpoint.architecture?.ablation });
  if (Number(checkpoint.architecture?.layers) !== 2) failures.push({ code: "checkpoint_layers_must_be_two", actual: checkpoint.architecture?.layers });
  if (!Array.isArray(checkpoint.parameter_tensors) || checkpoint.parameter_tensors.length === 0) failures.push({ code: "checkpoint_missing_parameter_tensors" });
  if (!(checkpoint.parameter_tensors || []).some((tensor) => String(tensor.name || "").startsWith("blocks.1."))) {
    failures.push({ code: "checkpoint_missing_second_layer_tensors" });
  }
  for (const tensor of checkpoint.parameter_tensors || []) {
    if (!tensor.name || !Array.isArray(tensor.shape) || !tensor.dtype || !tensor.encoding || tensor.values === undefined) {
      failures.push({ code: "checkpoint_tensor_missing_required_fields", tensor: tensor.name || "unknown" });
    }
    if (tensor.encoding === "base64_float32_le" && typeof tensor.values !== "string") {
      failures.push({ code: "checkpoint_tensor_base64_values_not_string", tensor: tensor.name || "unknown" });
    }
  }
  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_product_model_true" });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_release_checkpoint_true" });
  if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_commit_allowed_true" });
  if (checkpoint.created_for !== "small_decoder_pilot_only") failures.push({ code: "checkpoint_created_for_invalid", actual: checkpoint.created_for });
  return failures;
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

  if (config.run_id !== "r25v_two_layer_same_width" || config.variant_id !== "two_layer_same_width") {
    failures.push({ code: "r25v_config_variant_mismatch", run_id: config.run_id, variant_id: config.variant_id });
  }
  if (config.architecture?.ablation !== "two_layer_same_width") failures.push({ code: "r25v_config_ablation_mismatch", actual: config.architecture?.ablation });
  if (Number(config.architecture?.layers) !== 2) failures.push({ code: "r25v_config_layers_must_be_two", actual: config.architecture?.layers });
  if (config.phase_4_scaled_training !== false) failures.push({ code: "r25v_config_phase_4_must_be_false" });
  if (!datasetReport?.ok) failures.push({ code: "r25v_dataset_report_missing_or_not_ok" });
  if (!runReport) failures.push({ code: "r25v_run_report_missing", path: RUN_REPORT_PATH });
  if (approval?.consumed !== true) failures.push({ code: "r25v_approval_not_consumed" });
  if (approval?.allow_weight_commit !== false) failures.push({ code: "r25v_approval_allows_weight_commit" });
  if (approval?.allow_product_model_training !== false) failures.push({ code: "r25v_approval_allows_product_training" });
  if (approval?.allow_long_term_training !== false) failures.push({ code: "r25v_approval_allows_long_term_training" });
  if (approval?.allow_phase_4_scaled_training !== false) failures.push({ code: "r25v_approval_allows_phase_4_scaled_training" });
  if (approval?.allow_release_checkpoint !== false) failures.push({ code: "r25v_approval_allows_release_checkpoint" });

  const blocked = runReport?.small_pilot_training_ran === false && String(runReport?.reason || "").includes("unsupported_backend");

  if (runReport) {
    if (runReport.run_id && runReport.run_id !== "r25v_two_layer_same_width") failures.push({ code: "r25v_run_id_invalid", actual: runReport.run_id });
    if (runReport.variant_id && runReport.variant_id !== "two_layer_same_width") failures.push({ code: "r25v_variant_id_invalid", actual: runReport.variant_id });
    if (runReport.formal_product_training !== false) failures.push({ code: "formal_product_training_must_be_false" });
    if (runReport.long_term_training !== false) failures.push({ code: "long_term_training_must_be_false" });
    if (runReport.phase_4_scaled_training !== false) failures.push({ code: "phase_4_scaled_training_must_be_false" });
    if (runReport.product_model !== false) failures.push({ code: "product_model_must_be_false" });
    if (runReport.release_checkpoint !== false) failures.push({ code: "release_checkpoint_must_be_false" });
    if (REMOTE_MARKER_RE.test(JSON.stringify(runReport))) failures.push({ code: "remote_or_install_marker_in_run_report" });
    if (runReport.weights_tracked !== false) failures.push({ code: "run_report_claims_weights_tracked" });

    if (blocked) {
      if (runReport.ok !== true || runReport.skipped !== true) failures.push({ code: "blocked_report_must_be_ok_skipped" });
      if (runReport.architecture_ablation_training !== false) failures.push({ code: "blocked_report_must_not_claim_ablation_training" });
      if (Number(runReport.steps || 0) !== 0) failures.push({ code: "blocked_report_steps_must_be_zero", steps: runReport.steps });
    } else {
      if (runReport.ok !== true) failures.push({ code: "r25v_run_report_not_ok" });
      if (runReport.small_pilot_training_ran !== true) failures.push({ code: "r25v_training_did_not_run_or_block_cleanly" });
      if (runReport.architecture_ablation_training !== true) failures.push({ code: "r25v_architecture_ablation_training_not_true" });
      if (Number(runReport.actual_layers) !== 2) failures.push({ code: "r25v_actual_layers_must_be_two", actual: runReport.actual_layers });
      if (runReport.train_loss_decreased !== true || !finite(runReport.initial_train_loss) || !finite(runReport.final_train_loss)) failures.push({ code: "train_loss_did_not_decrease_or_not_finite" });
      if (runReport.dev_loss_finite !== true || !finite(runReport.initial_dev_loss) || !finite(runReport.final_dev_loss)) failures.push({ code: "dev_loss_not_finite" });
      if (!Number.isInteger(runReport.steps) || runReport.steps > Number(config.max_steps)) failures.push({ code: "pilot_steps_exceed_config", steps: runReport.steps, max_steps: config.max_steps });
      if (runReport.train_sequences !== Number(config.max_train_rows)) failures.push({ code: "train_sequence_count_mismatch", expected: config.max_train_rows, actual: runReport.train_sequences });
      if (runReport.dev_sequences !== Number(config.max_dev_rows)) failures.push({ code: "dev_sequence_count_mismatch", expected: config.max_dev_rows, actual: runReport.dev_sequences });
      if (runReport.heldout_sequences_prepared !== Number(config.max_heldout_rows)) failures.push({ code: "heldout_sequence_count_mismatch", expected: config.max_heldout_rows, actual: runReport.heldout_sequences_prepared });
      if (runReport.replayable_checkpoint_written !== true) failures.push({ code: "replayable_checkpoint_not_written" });
      if (runReport.replayable_checkpoint_path !== CHECKPOINT_PATH) failures.push({ code: "replayable_checkpoint_path_mismatch", actual: runReport.replayable_checkpoint_path });
      if (FORBIDDEN_OUTPUT_RE.test(String(runReport.sample_generation_preview || ""))) failures.push({ code: "forbidden_marker_in_generation_preview" });
      for (const path of runReport.artifact_paths || []) {
        if (!String(path).startsWith(OUTPUT_DIR)) failures.push({ code: "artifact_outside_r25v_output_dir", path });
        if (!(await exists(path))) failures.push({ code: "artifact_missing", path });
        if (!(await isIgnored(path))) failures.push({ code: "artifact_not_ignored", path });
        if (MODEL_WEIGHT_RE.test(path)) failures.push({ code: "forbidden_model_binary_artifact_extension", path });
      }
    }
  }

  let checkpointFailures = [];
  if (!blocked) {
    if (!checkpoint) failures.push({ code: "r25v_replayable_checkpoint_missing", path: CHECKPOINT_PATH });
    else {
      checkpointFailures = validateReplayableCheckpoint(checkpoint);
      failures.push(...checkpointFailures);
      if (!(await isIgnored(CHECKPOINT_PATH))) failures.push({ code: "checkpoint_not_ignored", path: CHECKPOINT_PATH });
    }
  }

  if ((datasetReport?.forbidden_sources_touched || []).length) failures.push({ code: "pilot_dataset_touched_forbidden_sources", sources: datasetReport.forbidden_sources_touched });
  if (datasetReport && datasetReport.balanced_sampling_used !== true) failures.push({ code: "r25v_dataset_did_not_use_balanced_sampling_plan" });
  if (trackedArtifacts.length) failures.push({ code: "pilot_artifacts_tracked_or_staged", trackedArtifacts });
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });

  const output = {
    ok: failures.length === 0,
    run_id: "r25v_two_layer_same_width",
    variant_id: "two_layer_same_width",
    blocked,
    small_pilot_training_ran: runReport?.small_pilot_training_ran === true,
    architecture_ablation_training: runReport?.architecture_ablation_training === true,
    backend: runReport?.backend || "unknown",
    actual_layers: runReport?.actual_layers ?? null,
    train_loss_decreased: runReport?.train_loss_decreased === true,
    dev_loss_finite: runReport?.dev_loss_finite === true,
    phase_4_scaled_training: false,
    replayable_checkpoint_written: runReport?.replayable_checkpoint_written === true,
    checkpoint_validates: checkpoint ? checkpointFailures.length === 0 : false,
    product_model: false,
    release_checkpoint: false,
    formal_product_training: false,
    long_term_training: false,
    artifacts_under_ignored_path: failures.every((failure) => failure.code !== "artifact_outside_r25v_output_dir" && failure.code !== "artifact_not_ignored"),
    weights_tracked: trackedArtifacts.length > 0,
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
