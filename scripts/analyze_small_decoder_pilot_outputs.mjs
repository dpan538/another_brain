#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.json";
const ARTIFACT_DIR = "artifacts/training_os/small_decoder_pilot/r25m/";
const R25N_DIR = "artifacts/training_os/small_decoder_pilot/r25n/";
const RUN_REPORT_PATH = `${ARTIFACT_DIR}r25m_small_decoder_run_report.json`;
const METRICS_PATH = `${ARTIFACT_DIR}r25m_small_decoder_metrics.json`;
const CHECKPOINT_PATH = `${ARTIFACT_DIR}r25m_small_decoder_checkpoint.json`;
const DATASET_REPORT_PATH = `${ARTIFACT_DIR}r25m_dataset_report.json`;
const OUTPUT_PATH = `${R25N_DIR}r25n_small_pilot_analysis.json`;
const FORBIDDEN_PREVIEW_RE = /chain[_ -]?of[_ -]?thought|hidden_prompt|system_prompt|private_memory|raw_private_data|BEGIN PRIVATE KEY|api[_-]?key|secret|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\/i;

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

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function gitLines(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: ROOT, maxBuffer: 12 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function relativeChange(initial, final) {
  const start = Number(initial);
  const end = Number(final);
  if (!finite(start) || !finite(end) || start === 0) return null;
  return (start - end) / Math.abs(start);
}

async function main() {
  if (!(await exists(RUN_REPORT_PATH))) {
    const blocked = {
      ok: true,
      status: "blocked_no_local_ignored_artifacts",
      artifacts_found: false,
      classification: "not_evaluated",
      training_rerun: false,
      notes: [
        "R25M ignored artifacts are not present in this checkout.",
        "R25N analysis does not rerun training."
      ]
    };
    await writeJson(OUTPUT_PATH, blocked);
    console.log(JSON.stringify(blocked, null, 2));
    return;
  }

  const config = await readJson(CONFIG_PATH);
  const run = await readJson(RUN_REPORT_PATH);
  const metrics = await readJson(METRICS_PATH).catch(() => null);
  const checkpoint = await readJson(CHECKPOINT_PATH).catch(() => null);
  const dataset = await readJson(DATASET_REPORT_PATH).catch(() => null);
  const trackedArtifacts = await gitLines(["ls-files", "--cached", config.output_dir]);
  const failures = [];

  const trainLossAbsoluteChange = Number(run.initial_train_loss) - Number(run.final_train_loss);
  const devLossAbsoluteChange = Number(run.initial_dev_loss) - Number(run.final_dev_loss);
  const trainLossRelativeChange = relativeChange(run.initial_train_loss, run.final_train_loss);
  const devLossRelativeChange = relativeChange(run.initial_dev_loss, run.final_dev_loss);
  const history = Array.isArray(metrics?.history) ? metrics.history : [];
  const historyFinite = history.every((point) => finite(point.train_loss) && finite(point.dev_loss));
  const historyMonotonicTrain = history.every((point, index) => index === 0 || Number(point.train_loss) <= Number(history[index - 1].train_loss) + 1e-9);

  if (run.ok !== true) failures.push({ code: "run_report_not_ok" });
  if (run.small_pilot_training_ran !== true) failures.push({ code: "historical_pilot_run_not_recorded" });
  if (run.formal_product_training !== false) failures.push({ code: "formal_product_training_must_be_false" });
  if (run.long_term_training !== false) failures.push({ code: "long_term_training_must_be_false" });
  if (run.product_model !== false) failures.push({ code: "product_model_must_be_false" });
  if (run.release_checkpoint !== false) failures.push({ code: "release_checkpoint_must_be_false" });
  if (run.train_loss_decreased !== true || trainLossAbsoluteChange <= 0) failures.push({ code: "train_loss_did_not_decrease" });
  if (run.dev_loss_finite !== true || !finite(run.initial_dev_loss) || !finite(run.final_dev_loss)) failures.push({ code: "dev_loss_not_finite" });
  if (!Number.isInteger(run.steps) || run.steps > Number(config.max_steps)) failures.push({ code: "steps_exceed_config", steps: run.steps, max_steps: config.max_steps });
  if (dataset?.train_sequences !== run.train_sequences || dataset?.dev_sequences !== run.dev_sequences) {
    failures.push({ code: "dataset_sequence_count_mismatch", dataset_train: dataset?.train_sequences, run_train: run.train_sequences, dataset_dev: dataset?.dev_sequences, run_dev: run.dev_sequences });
  }
  if (FORBIDDEN_PREVIEW_RE.test(String(run.sample_generation_preview || ""))) failures.push({ code: "forbidden_marker_in_generation_preview" });
  if (run.weights_tracked !== false || trackedArtifacts.length) failures.push({ code: "pilot_artifacts_tracked", trackedArtifacts });
  if (checkpoint?.product_model !== false) failures.push({ code: "checkpoint_claims_product_model" });
  if (checkpoint?.release_checkpoint !== false) failures.push({ code: "checkpoint_claims_release_checkpoint" });
  if (checkpoint?.weights_serialized !== false) failures.push({ code: "checkpoint_serialized_weights_unexpected" });
  if (!historyFinite) failures.push({ code: "metrics_history_has_non_finite_loss" });

  let classification = "invalid";
  if (failures.length === 0) {
    if (trainLossRelativeChange !== null && trainLossRelativeChange >= 0.001 && historyMonotonicTrain) classification = "pipeline_sanity_pass";
    else if (trainLossAbsoluteChange > 0 && run.dev_loss_finite === true) classification = "weak_signal";
    else classification = "unstable";
  }

  const report = {
    ok: failures.length === 0,
    status: "analyzed_r25m_ignored_artifacts",
    artifacts_found: true,
    classification,
    signal_strength: trainLossRelativeChange !== null && trainLossRelativeChange < 0.01 ? "small_loss_decrease_pipeline_signal" : "moderate_loss_decrease_pipeline_signal",
    train_loss: {
      initial: run.initial_train_loss,
      final: run.final_train_loss,
      absolute_decrease: trainLossAbsoluteChange,
      relative_decrease: trainLossRelativeChange
    },
    dev_loss: {
      initial: run.initial_dev_loss,
      final: run.final_dev_loss,
      absolute_decrease: devLossAbsoluteChange,
      relative_decrease: devLossRelativeChange,
      finite: run.dev_loss_finite === true
    },
    steps: run.steps,
    max_steps: config.max_steps,
    backend: run.backend,
    architecture_type: run.architecture_type,
    parameter_count: run.parameter_count,
    dataset: {
      train_sequences: dataset?.train_sequences || null,
      dev_sequences: dataset?.dev_sequences || null,
      report_matches_run: dataset?.train_sequences === run.train_sequences && dataset?.dev_sequences === run.dev_sequences
    },
    history_finite: historyFinite,
    history_monotonic_train_loss: historyMonotonicTrain,
    product_model: false,
    release_checkpoint: false,
    weights_tracked: trackedArtifacts.length > 0,
    training_rerun: false,
    notes: [
      "R25N analyzes R25M outputs only; it does not run training.",
      "The R25M loss decrease is small, so it is only a pipeline/mechanics signal.",
      "The R25M checkpoint is an ignored JSON digest with no serialized release weights."
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
