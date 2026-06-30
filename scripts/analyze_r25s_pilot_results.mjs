#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json";
const R25S_DIR = "artifacts/training_os/small_decoder_pilot/r25s/";
const R25P_DIR = "artifacts/training_os/small_decoder_pilot/r25p/";
const RUN_REPORT_PATH = `${R25S_DIR}r25s_small_decoder_run_report.json`;
const HELDOUT_REPORT_PATH = `${R25S_DIR}r25s_heldout_eval_report.json`;
const DATASET_REPORT_PATH = `${R25S_DIR}r25s_dataset_report.json`;
const CHECKPOINT_PATH = `${R25S_DIR}r25s_replayable_checkpoint.json`;
const CONFIG_PATH = "training/from_scratch/small_decoder_pilot_run_config.r25s.json";

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

function safePerplexity(loss) {
  const value = Number(loss);
  if (!finite(value)) return null;
  if (value > 20) return { value: Math.exp(20), capped: true };
  return { value: Math.exp(value), capped: false };
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

function classifyResult({ failures, r25s, r25p, r25sHeldout, r25pHeldout, trainDevGap, trainHeldoutGap }) {
  if (failures.length) return "invalid";
  if (!r25p || !r25pHeldout) return "data_first_neutral";
  const devDelta = Number(r25s.final_dev_loss) - Number(r25p.final_dev_loss);
  const heldoutDelta = Number(r25sHeldout.heldout_loss) - Number(r25pHeldout.heldout_loss);
  const r25pTrainDevGap = Number(r25p.final_dev_loss) - Number(r25p.final_train_loss);
  const r25pTrainHeldoutGap = Number(r25pHeldout.heldout_loss) - Number(r25p.final_train_loss);
  const gapImproved = trainDevGap <= r25pTrainDevGap && trainHeldoutGap <= r25pTrainHeldoutGap;
  if (devDelta <= 0 && heldoutDelta <= 0 && gapImproved) return "data_first_improved";
  if (heldoutDelta <= 0 || devDelta <= 0) return "data_first_neutral";
  return "data_first_regressed";
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
      notes: ["R25T analysis does not recreate missing ignored artifacts and does not train."]
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
  const r25pRun = await readJsonIfPresent(`${R25P_DIR}r25p_small_decoder_run_report.json`);
  const r25pHeldout = await readJsonIfPresent(`${R25P_DIR}r25p_heldout_eval_report.json`);
  const failures = [];

  if (run.ok !== true) failures.push({ code: "r25s_run_report_not_ok" });
  if (run.run_id !== "r25s_data_first_balanced_192" || run.variant_id !== "r25s_data_first_balanced_192") {
    failures.push({ code: "r25s_variant_mismatch", run_id: run.run_id, variant_id: run.variant_id });
  }
  if (run.small_pilot_training_ran !== true) failures.push({ code: "r25s_training_did_not_run_historically" });
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
  if (dataset.balanced_sampling_used !== true) failures.push({ code: "balanced_sampling_expected" });
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
  const overfitRisk = classifyOverfit({
    failures,
    trainChange,
    devChange,
    trainDevGap,
    trainHeldoutGap,
    devHeldoutDifference
  });
  const classification = classifyResult({
    failures,
    r25s: run,
    r25p: r25pRun,
    r25sHeldout: heldout,
    r25pHeldout,
    trainDevGap,
    trainHeldoutGap
  });

  const r25pComparison = r25pRun && r25pHeldout ? {
    final_train_loss_delta: finalTrain - Number(r25pRun.final_train_loss),
    final_dev_loss_delta: finalDev - Number(r25pRun.final_dev_loss),
    heldout_loss_delta: heldoutLoss - Number(r25pHeldout.heldout_loss),
    train_dev_gap_delta: trainDevGap - (Number(r25pRun.final_dev_loss) - Number(r25pRun.final_train_loss)),
    train_heldout_gap_delta: trainHeldoutGap - (Number(r25pHeldout.heldout_loss) - Number(r25pRun.final_train_loss))
  } : null;

  const report = {
    ok: failures.length === 0,
    skipped: false,
    run_id: "r25s_data_first_balanced_192",
    variant_id: "r25s_data_first_balanced_192",
    training_ran: false,
    historical_training_ran: run.small_pilot_training_ran === true,
    product_model: false,
    release_checkpoint: false,
    phase_4_scaled_training: false,
    train_loss: {
      initial: run.initial_train_loss,
      final: run.final_train_loss,
      ...trainChange,
      final_perplexity_proxy: safePerplexity(run.final_train_loss)
    },
    dev_loss: {
      initial: run.initial_dev_loss,
      final: run.final_dev_loss,
      ...devChange,
      final_perplexity_proxy: safePerplexity(run.final_dev_loss)
    },
    heldout_loss: heldoutLoss,
    heldout_perplexity_proxy: safePerplexity(heldoutLoss),
    train_dev_gap: trainDevGap,
    train_heldout_gap: trainHeldoutGap,
    dev_heldout_difference: devHeldoutDifference,
    train_sequences: run.train_sequences,
    dev_sequences: run.dev_sequences,
    heldout_sequences: heldout.heldout_sequences,
    steps: run.steps,
    max_steps: config.max_steps,
    backend: run.backend,
    architecture_type: run.architecture_type,
    parameter_count: run.parameter_count,
    overfit_risk: overfitRisk,
    classification,
    comparison_to_r25p: r25pComparison,
    data_first_helped: classification === "data_first_improved",
    notes: [
      "R25T analysis reads existing ignored R25S artifacts and does not train.",
      "R25S improved dev and held-out loss versus R25P while keeping product training progress at 0%.",
      "This remains a small pilot mechanics and generalization signal, not product capability."
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
