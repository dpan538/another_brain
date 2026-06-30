#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INCLUDE_R25P = process.argv.includes("--include-r25p");
const DECISION_MODE = process.argv.includes("--decision-mode");
const OUTPUT_PATH = DECISION_MODE
  ? "artifacts/training_os/small_decoder_pilot/r25q/r25q_history_comparison.json"
  : INCLUDE_R25P
  ? "artifacts/training_os/small_decoder_pilot/r25p/r25p_history_comparison.json"
  : "artifacts/training_os/small_decoder_pilot/r25o/r25o_history_comparison.json";

async function exists(path) {
  try {
    await access(resolve(ROOT, path));
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path) {
  return (await exists(path)) ? JSON.parse(await readFile(resolve(ROOT, path), "utf8")) : null;
}

async function writeJson(path, value) {
  const abs = resolve(ROOT, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function lossDelta(initial, final) {
  const start = Number(initial);
  const end = Number(final);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return {
    absolute_decrease: start - end,
    relative_decrease: start === 0 ? null : (start - end) / Math.abs(start)
  };
}

function chooseDecisionRecommendation(r25pAnalysis, r25pRun) {
  if (!r25pRun) return "pause_for_review";
  if (!r25pAnalysis?.ok) return "pause_for_review";
  if (r25pAnalysis.classification === "invalid" || r25pAnalysis.overfit_risk === "invalid") return "pause_for_review";
  if (r25pAnalysis.overfit_risk === "high") return "data_first_second_stage";
  if (r25pAnalysis.overfit_risk === "moderate" || r25pAnalysis.classification === "generalization_uncertain") {
    return "data_first_second_stage";
  }
  return "pause_for_review";
}

async function main() {
  const toy = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json");
  const r25m = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json");
  const r25nAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json");
  const r25nHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json");
  const r25p = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25pHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json");
  const r25pEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_eval_report.json");
  const r25pAnalysis = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const runs = [];

  if (toy?.ok) {
    runs.push({
      id: "R25K",
      kind: "toy_bigram_sanity",
      train_loss_change: lossDelta(toy.initial_loss, toy.final_loss),
      dev_loss_change: null,
      heldout_structural_metric: null,
      parameter_count: null,
      sequence_count: toy.sequence_count || null,
      steps: toy.steps,
      backend: "node_builtin",
      artifact_type: "ignored_toy_checkpoint_json"
    });
  }

  if (r25m?.ok) {
    runs.push({
      id: "R25M",
      kind: "small_decoder_pilot",
      train_loss_change: lossDelta(r25m.initial_train_loss, r25m.final_train_loss),
      dev_loss_change: lossDelta(r25m.initial_dev_loss, r25m.final_dev_loss),
      heldout_structural_metric: r25nHeldout?.heldout_metric ?? null,
      heldout_metric_name: r25nHeldout?.metric_name || null,
      parameter_count: r25m.parameter_count,
      sequence_count: r25m.train_sequences,
      dev_sequence_count: r25m.dev_sequences,
      steps: r25m.steps,
      backend: r25m.backend,
      artifact_type: "ignored_non_replayable_digest_checkpoint_json",
      analysis_classification: r25nAnalysis?.classification || null
    });
  }

  if (INCLUDE_R25P && r25p?.ok) {
    runs.push({
      id: "R25P",
      kind: "second_bounded_small_decoder_pilot",
      train_loss_change: lossDelta(r25p.initial_train_loss, r25p.final_train_loss),
      dev_loss_change: lossDelta(r25p.initial_dev_loss, r25p.final_dev_loss),
      heldout_loss: r25pHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25pHeldout?.heldout_loss_finite === true,
      parameter_count: r25p.parameter_count,
      sequence_count: r25p.train_sequences,
      dev_sequence_count: r25p.dev_sequences,
      heldout_sequence_count: r25pHeldout?.heldout_sequences ?? r25p.heldout_sequences_prepared ?? null,
      steps: r25p.steps,
      backend: r25p.backend,
      artifact_type: "ignored_replayable_checkpoint_json",
      replayable_checkpoint_available: r25p.replayable_checkpoint_written === true && r25pEval?.checkpoint_validates === true,
      overfit_risk: r25pAnalysis?.overfit_risk || null,
      analysis_classification: r25pAnalysis?.classification || null,
      train_dev_gap: r25pAnalysis?.train_dev_gap ?? null,
      train_heldout_gap: r25pAnalysis?.train_heldout_gap ?? null,
      dev_heldout_difference: r25pAnalysis?.dev_heldout_difference ?? null
    });
  }

  const r25mRun = runs.find((run) => run.id === "R25M");
  const r25pRun = runs.find((run) => run.id === "R25P");
  const dataset_size_difference = r25mRun && r25pRun
    ? {
        train_sequences_delta: Number(r25pRun.sequence_count || 0) - Number(r25mRun.sequence_count || 0),
        dev_sequences_delta: Number(r25pRun.dev_sequence_count || 0) - Number(r25mRun.dev_sequence_count || 0)
      }
    : null;
  const recommendationCategory = DECISION_MODE
    ? chooseDecisionRecommendation(r25pAnalysis, r25pRun)
    : INCLUDE_R25P
      ? "stop_and_review"
      : "future_r25p_requires_fresh_approval";

  const report = {
    ok: true,
    status: runs.length > 1 ? "history_compared" : runs.length === 1 ? "single_run_baseline" : "no_local_ignored_artifacts",
    decision_mode: DECISION_MODE,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    runs,
    dataset_size_difference,
    r25m_non_replayable_limitation: Boolean(r25mRun) ? "R25M stored a digest checkpoint and cannot provide true replayed held-out loss." : null,
    r25p_replayability: r25pRun?.replayable_checkpoint_available === true ? "replayable_checkpoint_available" : INCLUDE_R25P ? "not_available_or_not_validated" : "not_requested",
    recommendation_category: recommendationCategory,
    recommendation: DECISION_MODE
      ? "review_required_before_any_r25r_or_scaling"
      : INCLUDE_R25P ? "stop_and_review" : "future_r25p_requires_fresh_approval",
    notes: [
      DECISION_MODE
        ? "R25Q decision comparison does not train; it reads ignored reports only."
        : INCLUDE_R25P ? "R25P comparison does not train; it reads ignored reports only." : "R25O comparison does not train.",
      "R25M is the first small-pilot baseline.",
      DECISION_MODE
        ? "R25Q must not approve automatic phase_4 scaling or another training run."
        : INCLUDE_R25P
        ? "R25P is a second bounded pilot, not approval to scale automatically."
        : "Future R25P results should be added only from ignored artifacts after fresh approval."
    ]
  };
  await writeJson(OUTPUT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
