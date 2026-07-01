#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_analysis.json";
const R25Y_DIR = "artifacts/training_os/small_decoder_pilot/r25y/";
const R25S_DIR = "artifacts/training_os/small_decoder_pilot/r25s/";
const R25V_DIR = "artifacts/training_os/small_decoder_pilot/r25v/";
const R25P_DIR = "artifacts/training_os/small_decoder_pilot/r25p/";
const RUN_REPORT_PATH = `${R25Y_DIR}r25y_small_decoder_run_report.json`;
const HELDOUT_REPORT_PATH = `${R25Y_DIR}r25y_heldout_eval_report.json`;
const DATASET_REPORT_PATH = `${R25Y_DIR}r25y_dataset_report.json`;
const CHECKPOINT_PATH = `${R25Y_DIR}r25y_replayable_checkpoint.json`;
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25y.json";

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

function lossChange(initial, final) {
  const start = Number(initial);
  const end = Number(final);
  if (!finite(start) || !finite(end)) {
    return { absolute_decrease: null, relative_decrease: null };
  }
  return {
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

function compareTo(run, heldout, label, finalTrain, finalDev, heldoutLoss, trainDevGap, trainHeldoutGap) {
  if (!run || !heldout) return null;
  const baselineTrain = Number(run.final_train_loss);
  const baselineDev = Number(run.final_dev_loss);
  const baselineHeldout = Number(heldout.heldout_loss);
  const baselineTrainDevGap = baselineDev - baselineTrain;
  const baselineTrainHeldoutGap = baselineHeldout - baselineTrain;
  return {
    baseline: label,
    final_train_loss_delta: finite(finalTrain) && finite(baselineTrain) ? finalTrain - baselineTrain : null,
    final_dev_loss_delta: finite(finalDev) && finite(baselineDev) ? finalDev - baselineDev : null,
    heldout_loss_delta: finite(heldoutLoss) && finite(baselineHeldout) ? heldoutLoss - baselineHeldout : null,
    train_dev_gap_delta: finite(trainDevGap) && finite(baselineTrainDevGap) ? trainDevGap - baselineTrainDevGap : null,
    train_heldout_gap_delta: finite(trainHeldoutGap) && finite(baselineTrainHeldoutGap) ? trainHeldoutGap - baselineTrainHeldoutGap : null,
    baseline_train_loss: baselineTrain,
    baseline_dev_loss: baselineDev,
    baseline_heldout_loss: baselineHeldout
  };
}

function classifyOverfit({ failures, trainChange, devChange, trainDevGap, trainHeldoutGap, devHeldoutDifference }) {
  if (failures.length) return "invalid";
  const trainRelative = Number(trainChange.relative_decrease);
  const devRelative = Number(devChange.relative_decrease);
  if (trainRelative <= 0 || devRelative < 0) return "invalid";
  if (trainDevGap > 5 || trainHeldoutGap > 5 || (devRelative < 0.05 && trainRelative > 0.35)) return "high";
  if (trainDevGap > 2.5 || trainHeldoutGap > 2.5 || Math.abs(devHeldoutDifference) > 1.5) return "moderate";
  return "low";
}

function classifyRegularization({ failures, r25sComparison }) {
  if (failures.length) return "invalid";
  if (!r25sComparison) return "data_regularization_neutral";
  const devDelta = Number(r25sComparison.final_dev_loss_delta);
  const heldoutDelta = Number(r25sComparison.heldout_loss_delta);
  if (finite(devDelta) && finite(heldoutDelta) && devDelta <= 0 && heldoutDelta <= 0) {
    return "data_regularization_helped";
  }
  if (finite(devDelta) && finite(heldoutDelta) && devDelta > 0 && heldoutDelta > 0) {
    return "data_regularization_regressed";
  }
  return "data_regularization_neutral";
}

async function main() {
  const requiredArtifacts = [RUN_REPORT_PATH, HELDOUT_REPORT_PATH, DATASET_REPORT_PATH, CHECKPOINT_PATH];
  const missing = [];
  for (const path of requiredArtifacts) {
    if (!(await exists(path))) missing.push(path);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      training_ran: false,
      product_model: false,
      release_checkpoint: false,
      phase_4_scaled_training: false,
      notes: ["R25Z analysis does not recreate missing ignored artifacts and does not train."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const run = await readJson(RUN_REPORT_PATH);
  const heldout = await readJson(HELDOUT_REPORT_PATH);
  const dataset = await readJson(DATASET_REPORT_PATH);
  const checkpoint = await readJson(CHECKPOINT_PATH);
  const config = await readJson(CONFIG_PATH);
  const r25sRun = await readJsonIfPresent(`${R25S_DIR}r25s_small_decoder_run_report.json`);
  const r25sHeldout = await readJsonIfPresent(`${R25S_DIR}r25s_heldout_eval_report.json`);
  const r25vRun = await readJsonIfPresent(`${R25V_DIR}r25v_small_decoder_run_report.json`);
  const r25vHeldout = await readJsonIfPresent(`${R25V_DIR}r25v_heldout_eval_report.json`);
  const r25pRun = await readJsonIfPresent(`${R25P_DIR}r25p_small_decoder_run_report.json`);
  const r25pHeldout = await readJsonIfPresent(`${R25P_DIR}r25p_heldout_eval_report.json`);
  const failures = [];

  if (run.ok !== true) failures.push({ code: "r25y_run_report_not_ok" });
  if (run.run_id !== "r25y_data_regularized_192" || run.variant_id !== "r25y_data_regularized_192") {
    failures.push({ code: "r25y_variant_mismatch", run_id: run.run_id, variant_id: run.variant_id });
  }
  if (run.small_pilot_training_ran !== true) failures.push({ code: "r25y_training_did_not_run_historically" });
  if (run.data_regularization_training !== true) failures.push({ code: "data_regularization_training_expected" });
  if (run.architecture_ablation_training !== false) failures.push({ code: "architecture_ablation_must_be_false" });
  if (Number(run.actual_layers) !== 1) failures.push({ code: "actual_layers_must_remain_one", actual_layers: run.actual_layers });
  if (run.formal_product_training !== false) failures.push({ code: "formal_product_training_must_be_false" });
  if (run.long_term_training !== false) failures.push({ code: "long_term_training_must_be_false" });
  if (run.phase_4_scaled_training !== false) failures.push({ code: "phase_4_scaled_training_must_be_false" });
  if (run.product_model !== false) failures.push({ code: "product_model_must_be_false" });
  if (run.release_checkpoint !== false) failures.push({ code: "release_checkpoint_must_be_false" });
  if (run.weights_tracked !== false) failures.push({ code: "weights_tracked_must_be_false" });
  if (checkpoint.product_model !== false) failures.push({ code: "checkpoint_product_model_must_be_false" });
  if (checkpoint.release_checkpoint !== false) failures.push({ code: "checkpoint_release_checkpoint_must_be_false" });
  if (checkpoint.commit_allowed !== false) failures.push({ code: "checkpoint_commit_allowed_must_be_false" });
  if (Number(run.steps) > Number(config.max_steps)) failures.push({ code: "steps_exceed_config", steps: run.steps, max_steps: config.max_steps });
  if (Number(run.train_sequences) !== Number(dataset.train_sequences)) failures.push({ code: "train_sequence_report_mismatch" });
  if (Number(run.dev_sequences) !== Number(dataset.dev_sequences)) failures.push({ code: "dev_sequence_report_mismatch" });
  if (Number(run.heldout_sequences_prepared) !== Number(dataset.heldout_sequences_prepared)) failures.push({ code: "heldout_sequence_report_mismatch" });
  if (dataset.data_regularization_used !== true) failures.push({ code: "data_regularization_dataset_expected" });
  for (const [key, value] of Object.entries({
    initial_train_loss: run.initial_train_loss,
    final_train_loss: run.final_train_loss,
    initial_dev_loss: run.initial_dev_loss,
    final_dev_loss: run.final_dev_loss,
    heldout_loss: heldout.heldout_loss
  })) {
    if (!finite(value)) failures.push({ code: "loss_not_finite", key, value });
  }

  const trainChange = lossChange(run.initial_train_loss, run.final_train_loss);
  const devChange = lossChange(run.initial_dev_loss, run.final_dev_loss);
  const finalTrain = Number(run.final_train_loss);
  const finalDev = Number(run.final_dev_loss);
  const heldoutLoss = Number(heldout.heldout_loss);
  const trainDevGap = finalDev - finalTrain;
  const trainHeldoutGap = heldoutLoss - finalTrain;
  const devHeldoutDifference = heldoutLoss - finalDev;
  const r25sComparison = compareTo(r25sRun, r25sHeldout, "r25s_data_first_balanced_192", finalTrain, finalDev, heldoutLoss, trainDevGap, trainHeldoutGap);
  const r25vComparison = compareTo(r25vRun, r25vHeldout, "r25v_two_layer_same_width", finalTrain, finalDev, heldoutLoss, trainDevGap, trainHeldoutGap);
  const r25pComparison = compareTo(r25pRun, r25pHeldout, "r25p_more_sequences_128", finalTrain, finalDev, heldoutLoss, trainDevGap, trainHeldoutGap);
  const overfitRisk = classifyOverfit({ failures, trainChange, devChange, trainDevGap, trainHeldoutGap, devHeldoutDifference });
  const regularizationResult = classifyRegularization({ failures, r25sComparison });

  const report = {
    ok: failures.length === 0,
    skipped: false,
    run_id: "r25y_data_regularized_192",
    variant_id: "r25y_data_regularized_192",
    training_ran: false,
    historical_training_ran: run.small_pilot_training_ran === true,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training: false,
    data_regularization_training: true,
    actual_layers: run.actual_layers,
    learning_rate: run.learning_rate,
    train_loss: {
      initial: run.initial_train_loss,
      final: run.final_train_loss,
      ...trainChange
    },
    dev_loss: {
      initial: run.initial_dev_loss,
      final: run.final_dev_loss,
      ...devChange
    },
    heldout_loss: heldoutLoss,
    train_dev_gap: trainDevGap,
    train_heldout_gap: trainHeldoutGap,
    dev_heldout_difference: devHeldoutDifference,
    train_sequences: run.train_sequences,
    dev_sequences: run.dev_sequences,
    heldout_sequences: heldout.heldout_sequences,
    steps: run.steps,
    max_steps: config.max_steps,
    backend: run.backend,
    backend_library_version: run.backend_library_version || null,
    architecture_type: run.architecture_type,
    parameter_count: run.parameter_count,
    regularization_knobs: run.regularization_knobs || null,
    overfit_risk: overfitRisk,
    regularization_result: regularizationResult,
    classification: regularizationResult,
    comparison_to_r25s: r25sComparison,
    comparison_to_r25v: r25vComparison,
    comparison_to_r25p: r25pComparison,
    data_regularization_helped: regularizationResult === "data_regularization_helped",
    notes: [
      "R25Z analysis reads existing ignored R25Y artifacts and does not train.",
      "R25Y improved held-out loss versus R25P and R25V but did not beat R25S.",
      "This remains phase_3 pilot evidence only, not product capability."
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
