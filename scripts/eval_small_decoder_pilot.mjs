#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const BACKEND_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_numeric_backend_report.json";
const RUN_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json";
const DATASET_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_dataset_report.json";
const EVAL_REPORT_PATH = "artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_eval_report.json";
const MODEL_WEIGHT_RE = /\.(safetensors|gguf|bin|pt|pth|onnx|mlmodel|mlpackage|ckpt)$/i;
const FORBIDDEN_OUTPUT_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data/i;
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

async function main() {
  const failures = [];
  const config = await readJson(CONFIG_PATH);
  const backendReport = await readJson(BACKEND_REPORT_PATH).catch(() => null);
  const datasetReport = await readJson(DATASET_REPORT_PATH).catch(() => null);
  const runReport = await readJson(RUN_REPORT_PATH).catch(() => null);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", config.output_dir]);
  const trackedWeights = (await gitLines(["ls-files"])).filter((path) => MODEL_WEIGHT_RE.test(path));

  if (!backendReport?.ok) failures.push({ code: "numeric_backend_report_missing_or_not_ok" });
  if (!datasetReport?.ok) failures.push({ code: "pilot_dataset_report_missing_or_not_ok" });
  if (!runReport) failures.push({ code: "pilot_run_report_missing", path: RUN_REPORT_PATH });

  const blocked = Boolean(
    backendReport?.can_run_small_pilot === false &&
    runReport?.small_pilot_training_ran === false &&
    /backend/i.test(String(runReport?.reason || backendReport?.reason || ""))
  );

  if (runReport && !blocked) {
    if (runReport.small_pilot_training_ran !== true) failures.push({ code: "small_pilot_training_did_not_run" });
    if (runReport.formal_product_training !== false) failures.push({ code: "formal_product_training_must_be_false" });
    if (runReport.long_term_training !== false) failures.push({ code: "long_term_training_must_be_false" });
    if (runReport.product_model !== false) failures.push({ code: "product_model_must_be_false" });
    if (runReport.release_checkpoint !== false) failures.push({ code: "release_checkpoint_must_be_false" });
    if (runReport.train_loss_decreased !== true) failures.push({ code: "train_loss_did_not_decrease", initial: runReport.initial_train_loss, final: runReport.final_train_loss });
    if (runReport.dev_loss_finite !== true || !finite(runReport.initial_dev_loss) || !finite(runReport.final_dev_loss)) failures.push({ code: "dev_loss_not_finite" });
    if (!Number.isInteger(runReport.steps) || runReport.steps > Number(config.max_steps)) failures.push({ code: "pilot_steps_exceed_config", steps: runReport.steps, max_steps: config.max_steps });
    if (runReport.weights_tracked !== false) failures.push({ code: "run_report_claims_weights_tracked" });
    if (FORBIDDEN_OUTPUT_RE.test(String(runReport.sample_generation_preview || ""))) failures.push({ code: "forbidden_marker_in_generation_preview" });
    if (REMOTE_MARKER_RE.test(JSON.stringify(runReport))) failures.push({ code: "remote_or_install_marker_in_run_report" });
    for (const path of runReport.artifact_paths || []) {
      if (!String(path).startsWith(config.output_dir)) failures.push({ code: "artifact_outside_r25m_output_dir", path });
      if (!(await exists(path))) failures.push({ code: "artifact_missing", path });
      if (!(await isIgnored(path))) failures.push({ code: "artifact_not_ignored", path });
      if (MODEL_WEIGHT_RE.test(path)) failures.push({ code: "forbidden_model_binary_artifact_extension", path });
    }
  }

  if (blocked && runReport) {
    if (runReport.product_model !== false) failures.push({ code: "blocked_report_product_model_not_false" });
    if (runReport.release_checkpoint !== false) failures.push({ code: "blocked_report_release_checkpoint_not_false" });
    if (runReport.formal_product_training !== false) failures.push({ code: "blocked_report_formal_product_training_not_false" });
  }

  if ((datasetReport?.forbidden_sources_touched || []).length) failures.push({ code: "pilot_dataset_touched_forbidden_sources", sources: datasetReport.forbidden_sources_touched });
  if (trackedArtifacts.length) failures.push({ code: "pilot_artifacts_tracked_or_staged", trackedArtifacts });
  if (trackedWeights.length) failures.push({ code: "tracked_model_like_weight_extension", trackedWeights });

  const output = {
    ok: failures.length === 0,
    blocked_due_to_missing_numeric_backend: blocked,
    small_pilot_training_ran: runReport?.small_pilot_training_ran === true,
    backend: runReport?.backend || backendReport?.backend || "unknown",
    train_loss_decreased: runReport?.train_loss_decreased === true,
    dev_loss_finite: runReport?.dev_loss_finite === true,
    product_model: false,
    release_checkpoint: false,
    formal_product_training: false,
    long_term_training: false,
    artifacts_under_ignored_path: failures.every((failure) => failure.code !== "artifact_outside_r25m_output_dir" && failure.code !== "artifact_not_ignored"),
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
