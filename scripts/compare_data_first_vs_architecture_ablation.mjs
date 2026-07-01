#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = "artifacts/training_os/small_decoder_pilot/r25w/r25w_data_vs_architecture_comparison.json";

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

function pilotSnapshot(id, run, heldout, analysis) {
  if (!run || !heldout) return null;
  const finalTrain = Number(run.final_train_loss);
  const finalDev = Number(run.final_dev_loss);
  const heldoutLoss = Number(heldout.heldout_loss);
  return {
    id,
    run_id: run.run_id,
    variant_id: run.variant_id,
    train_sequences: run.train_sequences,
    dev_sequences: run.dev_sequences,
    heldout_sequences: heldout.heldout_sequences ?? run.heldout_sequences_prepared ?? null,
    parameter_count: run.parameter_count,
    final_train_loss: finite(finalTrain) ? finalTrain : null,
    final_dev_loss: finite(finalDev) ? finalDev : null,
    heldout_loss: finite(heldoutLoss) ? heldoutLoss : null,
    train_dev_gap: finite(finalTrain) && finite(finalDev) ? finalDev - finalTrain : null,
    train_heldout_gap: finite(finalTrain) && finite(heldoutLoss) ? heldoutLoss - finalTrain : null,
    overfit_risk: analysis?.overfit_risk || null,
    classification: analysis?.classification || analysis?.ablation_result || null,
    product_model: false,
    release_checkpoint: false
  };
}

function metricDelta(current, baseline) {
  if (!current || !baseline) return null;
  return {
    final_train_loss_delta: finite(current.final_train_loss) && finite(baseline.final_train_loss) ? current.final_train_loss - baseline.final_train_loss : null,
    final_dev_loss_delta: finite(current.final_dev_loss) && finite(baseline.final_dev_loss) ? current.final_dev_loss - baseline.final_dev_loss : null,
    heldout_loss_delta: finite(current.heldout_loss) && finite(baseline.heldout_loss) ? current.heldout_loss - baseline.heldout_loss : null,
    train_dev_gap_delta: finite(current.train_dev_gap) && finite(baseline.train_dev_gap) ? current.train_dev_gap - baseline.train_dev_gap : null,
    train_heldout_gap_delta: finite(current.train_heldout_gap) && finite(baseline.train_heldout_gap) ? current.train_heldout_gap - baseline.train_heldout_gap : null,
    parameter_count_delta: finite(current.parameter_count) && finite(baseline.parameter_count) ? current.parameter_count - baseline.parameter_count : null
  };
}

function bestByHeldout(pilots) {
  const available = pilots.filter((pilot) => pilot && finite(pilot.heldout_loss));
  if (!available.length) return "unknown";
  available.sort((a, b) => Number(a.heldout_loss) - Number(b.heldout_loss));
  return available[0].run_id;
}

function chooseRecommendation({ dataFirstBest, architectureHelped, r25vVsR25s }) {
  if (architectureHelped === true) return "design_regularization_only";
  if (dataFirstBest === true && r25vVsR25s?.heldout_loss_delta > 0) return "pause_phase3_for_review";
  if (dataFirstBest === true) return "return_to_data_first";
  return "pause_phase3_for_review";
}

async function main() {
  const r25pRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25pHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json");
  const r25pAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const r25sRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25sAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json");
  const r25vRun = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json");
  const r25vHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json");
  const r25vAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_analysis.json");
  const r25qDecision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_next_step_decision.json");
  const r25tDecision = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json");

  const missing = [];
  for (const [label, value] of Object.entries({ r25pRun, r25pHeldout, r25sRun, r25sHeldout, r25vRun, r25vHeldout, r25vAnalysis })) {
    if (!value) missing.push(label);
  }
  if (missing.length) {
    const report = {
      ok: true,
      skipped: true,
      reason: "ignored_artifacts_missing",
      missing,
      data_first_best_so_far: null,
      architecture_ablation_helped: false,
      best_pilot: "unknown",
      phase4_approved: false,
      recommendation: "pause_phase3_for_review",
      reasons: ["R25W cannot compare missing ignored artifacts and does not recreate them."],
      risks: ["Missing local artifacts should lead to review, not rerunning consumed approvals."]
    };
    await writeJson(OUTPUT_PATH, report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const r25p = pilotSnapshot("R25P", r25pRun, r25pHeldout, r25pAnalysis);
  const r25s = pilotSnapshot("R25S", r25sRun, r25sHeldout, r25sAnalysis);
  const r25v = pilotSnapshot("R25V", r25vRun, r25vHeldout, r25vAnalysis);
  const bestPilot = bestByHeldout([r25p, r25s, r25v]);
  const r25sVsR25p = metricDelta(r25s, r25p);
  const r25vVsR25s = metricDelta(r25v, r25s);
  const r25vVsR25p = metricDelta(r25v, r25p);
  const dataFirstBest = bestPilot === "r25s_data_first_balanced_192";
  const architectureHelped = r25vAnalysis?.architecture_ablation_helped === true ||
    (finite(r25vVsR25s?.final_dev_loss_delta) && finite(r25vVsR25s?.heldout_loss_delta) && r25vVsR25s.final_dev_loss_delta <= 0 && r25vVsR25s.heldout_loss_delta <= 0);
  const recommendation = chooseRecommendation({ dataFirstBest, architectureHelped, r25vVsR25s });

  const report = {
    ok: true,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    data_first_best_so_far: dataFirstBest,
    architecture_ablation_helped: architectureHelped,
    best_pilot: bestPilot,
    phase4_approved: false,
    recommendation,
    pilots: { r25p, r25s, r25v },
    deltas: {
      r25s_vs_r25p: r25sVsR25p,
      r25v_vs_r25s: r25vVsR25s,
      r25v_vs_r25p: r25vVsR25p
    },
    prior_decisions: {
      r25q_recommendation: r25qDecision?.recommendation || null,
      r25t_recommendation: r25tDecision?.recommendation || null
    },
    reasons: [
      dataFirstBest
        ? "R25S has the best held-out replay loss among R25P/R25S/R25V."
        : "The local reports do not show R25S as the best held-out pilot.",
      architectureHelped
        ? "R25V improved both dev and held-out loss versus R25S."
        : "R25V improved train loss slightly but worsened dev and held-out loss versus R25S.",
      "Phase_4 scaled training remains not approved regardless of pilot comparison."
    ],
    risks: [
      "R25V may have added capacity without improving generalization.",
      "Continuing phase_3 without review risks optimizing to small-pilot artifacts.",
      "Any future run requires fresh approval and must keep product training progress at 0%."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
