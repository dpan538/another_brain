#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25z/r25z_data_regularization_comparison.json";

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function metric(run, heldout) {
  if (!run || !heldout) return null;
  return {
    final_train_loss: Number(run.final_train_loss),
    final_dev_loss: Number(run.final_dev_loss),
    heldout_loss: Number(heldout.heldout_loss),
    train_dev_gap: Number(run.final_dev_loss) - Number(run.final_train_loss),
    train_heldout_gap: Number(heldout.heldout_loss) - Number(run.final_train_loss),
    train_sequences: run.train_sequences,
    dev_sequences: run.dev_sequences,
    heldout_sequences: heldout.heldout_sequences,
    parameter_count: run.parameter_count,
    backend: run.backend
  };
}

function delta(current, baseline) {
  if (!current || !baseline) return null;
  return {
    final_train_loss_delta: current.final_train_loss - baseline.final_train_loss,
    final_dev_loss_delta: current.final_dev_loss - baseline.final_dev_loss,
    heldout_loss_delta: current.heldout_loss - baseline.heldout_loss,
    train_dev_gap_delta: current.train_dev_gap - baseline.train_dev_gap,
    train_heldout_gap_delta: current.train_heldout_gap - baseline.train_heldout_gap
  };
}

function helped(deltaValue) {
  return Boolean(deltaValue && deltaValue.final_dev_loss_delta <= 0 && deltaValue.heldout_loss_delta <= 0);
}

function bestPilot(metrics) {
  const candidates = Object.entries(metrics)
    .filter(([, value]) => value && finite(value.heldout_loss))
    .sort((a, b) => a[1].heldout_loss - b[1].heldout_loss);
  return candidates[0]?.[0] || "unknown";
}

async function main() {
  const r25pRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25pHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json");
  const r25sRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25vRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json");
  const r25vHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json");
  const r25yRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_run_report.json");
  const r25yHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json");
  const r25wDecision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_next_step_decision.json");
  const r25xReview = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_phase3_review_report.json");

  const metrics = {
    r25p_more_sequences_128: metric(r25pRun, r25pHeldout),
    r25s_data_first_balanced_192: metric(r25sRun, r25sHeldout),
    r25v_two_layer_same_width: metric(r25vRun, r25vHeldout),
    r25y_data_regularized_192: metric(r25yRun, r25yHeldout)
  };
  const r25y = metrics.r25y_data_regularized_192;
  const deltaVsR25s = delta(r25y, metrics.r25s_data_first_balanced_192);
  const deltaVsR25v = delta(r25y, metrics.r25v_two_layer_same_width);
  const deltaVsR25p = delta(r25y, metrics.r25p_more_sequences_128);
  const best = bestPilot(metrics);
  const r25yHelpedVsR25s = helped(deltaVsR25s);
  const r25yHelpedVsR25v = helped(deltaVsR25v);
  const r25yHelpedVsR25p = helped(deltaVsR25p);

  const recommendation = r25yHelpedVsR25s
    ? "begin_phase4_readiness_review_no_training"
    : "pause_phase3_for_review";

  const report = {
    ok: Boolean(r25y && finite(r25y.heldout_loss)),
    best_pilot: best,
    r25y_helped_vs_r25s: r25yHelpedVsR25s,
    r25y_helped_vs_r25v: r25yHelpedVsR25v,
    r25y_helped_vs_r25p: r25yHelpedVsR25p,
    heldout_delta_vs_r25s: deltaVsR25s?.heldout_loss_delta ?? null,
    dev_delta_vs_r25s: deltaVsR25s?.final_dev_loss_delta ?? null,
    gap_delta_vs_r25s: deltaVsR25s?.train_heldout_gap_delta ?? null,
    delta_vs_r25s: deltaVsR25s,
    delta_vs_r25v: deltaVsR25v,
    delta_vs_r25p: deltaVsR25p,
    metrics,
    phase4_approved: false,
    recommendation,
    reasons: r25yHelpedVsR25s
      ? [
          "R25Y did not regress against R25S by dev and held-out replay metrics.",
          "Any phase_4 work would still be a readiness review only, not training."
        ]
      : [
          "R25Y improved over R25P and R25V but did not beat the R25S held-out result.",
          "The data-regularization change did not provide enough evidence for another immediate pilot.",
          "R25S remains best-so-far by held-out replay loss."
        ],
    risks: [
      "Small-pilot replay loss is not a product benchmark.",
      "Repeated phase_3 pilots can overfit the R25L corpus if continued without review.",
      "Phase_4 scaled training remains blocked and unapproved."
    ],
    r25w_recommendation: r25wDecision?.recommendation || null,
    r25x_recommendation: r25xReview?.recommendation || null,
    training_ran: false,
    product_model: false,
    release_checkpoint: false
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
