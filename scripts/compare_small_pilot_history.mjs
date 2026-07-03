#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INCLUDE_R25P = process.argv.includes("--include-r25p");
const INCLUDE_R25S = process.argv.includes("--include-r25s");
const INCLUDE_R25V = process.argv.includes("--include-r25v");
const INCLUDE_R25Y = process.argv.includes("--include-r25y");
const INCLUDE_R25AC = process.argv.includes("--include-r25ac");
const INCLUDE_R25AO = process.argv.includes("--include-r25ao");
const R25AP_REVIEW = process.argv.includes("--r25ap-review");
const DECISION_MODE = process.argv.includes("--decision-mode");
const CHINESE_PERSONAL_REVIEW = process.argv.includes("--chinese-personal-review");

function outputPath() {
  if (R25AP_REVIEW) return "artifacts/training_os/small_decoder_pilot/r25ap/r25ap_history_comparison.json";
  if (INCLUDE_R25AO) return "artifacts/training_os/small_decoder_pilot/r25ao/r25ao_history_comparison.json";
  if (CHINESE_PERSONAL_REVIEW) return "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_small_pilot_history_comparison.json";
  if (INCLUDE_R25AC) return "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_history_comparison.json";
  if (INCLUDE_R25Y) return "artifacts/training_os/small_decoder_pilot/r25y/r25y_history_comparison.json";
  if (INCLUDE_R25V) return "artifacts/training_os/small_decoder_pilot/r25v/r25v_history_comparison.json";
  if (DECISION_MODE && INCLUDE_R25S) return "artifacts/training_os/small_decoder_pilot/r25s/r25s_history_comparison.json";
  if (DECISION_MODE) return "artifacts/training_os/small_decoder_pilot/r25q/r25q_history_comparison.json";
  if (INCLUDE_R25P) return "artifacts/training_os/small_decoder_pilot/r25p/r25p_history_comparison.json";
  return "artifacts/training_os/small_decoder_pilot/r25o/r25o_history_comparison.json";
}

const OUTPUT_PATH = outputPath();

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

function chooseR25sRecommendation(r25sRun, r25sHeldout, r25pRun, r25pHeldout) {
  if (!r25sRun?.ok || !r25sHeldout?.ok) return "stop_and_review";
  if (!Number.isFinite(Number(r25sHeldout.heldout_loss))) return "stop_and_review";
  if (!r25pRun || !r25pHeldout) return "stop_and_review";
  const r25sDev = Number(r25sRun.final_dev_loss);
  const r25pDev = Number(r25pRun.final_dev_loss);
  const r25sHeld = Number(r25sHeldout.heldout_loss);
  const r25pHeld = Number(r25pHeldout.heldout_loss);
  if (Number.isFinite(r25sDev) && Number.isFinite(r25pDev) && Number.isFinite(r25sHeld) && Number.isFinite(r25pHeld)) {
    if (r25sDev <= r25pDev && r25sHeld <= r25pHeld) return "data_improved_continue_review";
    if (r25sHeld <= r25pHeld) return "architecture_ablation_may_be_considered";
  }
  return "stop_and_review";
}

function chooseR25vRecommendation(r25vRun, r25vHeldout, r25sRun, r25sHeldout) {
  if (r25vRun?.skipped && String(r25vRun.reason || "").includes("unsupported_backend")) return "stop_and_review";
  if (!r25vRun?.ok || !r25vHeldout?.ok) return "stop_and_review";
  if (!Number.isFinite(Number(r25vHeldout.heldout_loss))) return "stop_and_review";
  if (!r25sRun || !r25sHeldout) return "stop_and_review";
  const r25vDev = Number(r25vRun.final_dev_loss);
  const r25sDev = Number(r25sRun.final_dev_loss);
  const r25vHeld = Number(r25vHeldout.heldout_loss);
  const r25sHeld = Number(r25sHeldout.heldout_loss);
  if (Number.isFinite(r25vDev) && Number.isFinite(r25sDev) && Number.isFinite(r25vHeld) && Number.isFinite(r25sHeld)) {
    if (r25vDev <= r25sDev && r25vHeld <= r25sHeld) return "architecture_ablation_helped_review_next";
    if (r25vHeld > r25sHeld) return "data_first_still_better";
  }
  return "phase4_still_not_approved";
}

function chooseR25yRecommendation(r25yRun, r25yHeldout, r25sRun, r25sHeldout) {
  if (!r25yRun?.ok || !r25yHeldout?.ok) return "stop_and_review";
  if (!Number.isFinite(Number(r25yHeldout.heldout_loss))) return "stop_and_review";
  if (!r25sRun || !r25sHeldout) return "stop_and_review";
  const r25yDev = Number(r25yRun.final_dev_loss);
  const r25sDev = Number(r25sRun.final_dev_loss);
  const r25yHeld = Number(r25yHeldout.heldout_loss);
  const r25sHeld = Number(r25sHeldout.heldout_loss);
  if (Number.isFinite(r25yDev) && Number.isFinite(r25sDev) && Number.isFinite(r25yHeld) && Number.isFinite(r25sHeld)) {
    if (r25yDev <= r25sDev && r25yHeld <= r25sHeld) return "data_regularization_helped_review_next";
    if (r25yHeld <= r25sHeld) return "data_regularization_neutral";
    return "data_regularization_regressed";
  }
  return "phase4_still_not_approved";
}

function chooseR25acRecommendation(r25acRun, r25acHeldout, r25sRun, r25sHeldout, r25acDataset) {
  if (!r25acRun?.ok || !r25acHeldout?.ok) return "stop_and_review";
  const mix = r25acRun.actual_language_mix || r25acDataset?.actual_train_language_mix || {};
  if (Number(mix.zh || 0) < 0.7 || Number(mix.en || 0) > 0.1) return "data_issue_review";
  const r25acHeld = Number(r25acHeldout.heldout_loss);
  const r25sHeld = Number(r25sHeldout?.heldout_loss);
  const completeCoverage = Object.values(r25acRun.personal_target_coverage || r25acDataset?.personal_target_coverage || {})
    .every((entry) => Number(entry?.rows || 0) > 0);
  if (!completeCoverage) return "chinese_personal_neutral";
  if (Number.isFinite(r25acHeld) && Number.isFinite(r25sHeld) && r25acHeld <= r25sHeld) {
    return "chinese_personal_helped_review_next";
  }
  return "chinese_personal_neutral";
}

function chooseR25aoRecommendation(r25aoRun, r25aoHeldout, r25acRun, r25acHeldout, r25sRun, r25sHeldout, r25aoDataset) {
  if (!r25aoRun?.ok || !r25aoHeldout?.ok) return "stop_and_review";
  const mix = r25aoRun.actual_language_mix || r25aoDataset?.actual_train_language_mix || {};
  if (Number(mix.zh || 0) < 0.7 || Number(mix.en || 0) > 0.1) return "data_issue_review";
  const completeCoverage = Object.values(r25aoRun.personal_target_coverage || r25aoDataset?.personal_target_coverage || {})
    .every((entry) => Number(entry?.rows || 0) > 0);
  if (!completeCoverage) return "expanded_chinese_personal_neutral";
  const r25aoHeld = Number(r25aoHeldout.heldout_loss);
  const r25acHeld = Number(r25acHeldout?.heldout_loss);
  const r25sHeld = Number(r25sHeldout?.heldout_loss);
  if (Number.isFinite(r25aoHeld) && Number.isFinite(r25acHeld) && r25aoHeld <= r25acHeld) {
    return "expanded_chinese_personal_helped_review_next";
  }
  if (Number.isFinite(r25aoHeld) && Number.isFinite(r25sHeld) && r25aoHeld <= r25sHeld) {
    return "expanded_chinese_personal_helped_review_next";
  }
  return "expanded_chinese_personal_neutral";
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
  const r25s = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25sEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_eval_report.json");
  const r25sDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_dataset_report.json");
  const r25v = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json");
  const r25vHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json");
  const r25vEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_eval_report.json");
  const r25vDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_dataset_report.json");
  const r25y = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_run_report.json");
  const r25yHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json");
  const r25yEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_eval_report.json");
  const r25yDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_dataset_report.json");
  const r25ac = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json");
  const r25acHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_heldout_eval_report.json");
  const r25acEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_eval_report.json");
  const r25acDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_dataset_report.json");
  const r25acBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_chinese_personal_breakdown.json");
  const r25ao = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_run_report.json");
  const r25aoHeldout = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_heldout_eval_report.json");
  const r25aoEval = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_small_decoder_eval_report.json");
  const r25aoDataset = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_dataset_report.json");
  const r25aoBreakdown = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ao/r25ao_chinese_personal_breakdown.json");
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

  if (INCLUDE_R25S && r25s?.ok) {
    runs.push({
      id: "R25S",
      kind: "data_first_bounded_small_decoder_pilot",
      train_loss_change: lossDelta(r25s.initial_train_loss, r25s.final_train_loss),
      dev_loss_change: lossDelta(r25s.initial_dev_loss, r25s.final_dev_loss),
      heldout_loss: r25sHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25sHeldout?.heldout_loss_finite === true,
      parameter_count: r25s.parameter_count,
      sequence_count: r25s.train_sequences,
      dev_sequence_count: r25s.dev_sequences,
      heldout_sequence_count: r25sHeldout?.heldout_sequences ?? r25s.heldout_sequences_prepared ?? null,
      steps: r25s.steps,
      backend: r25s.backend,
      artifact_type: "ignored_replayable_checkpoint_json",
      replayable_checkpoint_available: r25s.replayable_checkpoint_written === true && r25sEval?.checkpoint_validates === true,
      balanced_sampling_used: r25sDataset?.balanced_sampling_used === true,
      phase_4_scaled_training: false
    });
  }

  if (INCLUDE_R25V && r25v) {
    runs.push({
      id: "R25V",
      kind: "bounded_architecture_ablation_pilot",
      train_loss_change: r25v.small_pilot_training_ran ? lossDelta(r25v.initial_train_loss, r25v.final_train_loss) : null,
      dev_loss_change: r25v.small_pilot_training_ran ? lossDelta(r25v.initial_dev_loss, r25v.final_dev_loss) : null,
      heldout_loss: r25vHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25vHeldout?.heldout_loss_finite === true,
      parameter_count: r25v.parameter_count || null,
      sequence_count: r25v.train_sequences || null,
      dev_sequence_count: r25v.dev_sequences || null,
      heldout_sequence_count: r25vHeldout?.heldout_sequences ?? r25v.heldout_sequences_prepared ?? null,
      steps: r25v.steps || 0,
      backend: r25v.backend,
      artifact_type: r25v.small_pilot_training_ran ? "ignored_replayable_checkpoint_json" : "blocked_no_checkpoint",
      replayable_checkpoint_available: r25v.replayable_checkpoint_written === true && r25vEval?.checkpoint_validates === true,
      balanced_sampling_used: r25vDataset?.balanced_sampling_used === true,
      architecture_ablation_training: r25v.architecture_ablation_training === true,
      actual_layers: r25v.actual_layers ?? null,
      phase_4_scaled_training: false,
      blocked: r25v.skipped === true,
      blocked_reason: r25v.skipped ? r25v.reason || null : null
    });
  }

  if (INCLUDE_R25Y && r25y) {
    runs.push({
      id: "R25Y",
      kind: "bounded_data_regularization_pilot",
      train_loss_change: r25y.small_pilot_training_ran ? lossDelta(r25y.initial_train_loss, r25y.final_train_loss) : null,
      dev_loss_change: r25y.small_pilot_training_ran ? lossDelta(r25y.initial_dev_loss, r25y.final_dev_loss) : null,
      heldout_loss: r25yHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25yHeldout?.heldout_loss_finite === true,
      parameter_count: r25y.parameter_count || null,
      sequence_count: r25y.train_sequences || null,
      dev_sequence_count: r25y.dev_sequences || null,
      heldout_sequence_count: r25yHeldout?.heldout_sequences ?? r25y.heldout_sequences_prepared ?? null,
      steps: r25y.steps || 0,
      backend: r25y.backend,
      artifact_type: r25y.small_pilot_training_ran ? "ignored_replayable_checkpoint_json" : "blocked_no_checkpoint",
      replayable_checkpoint_available: r25y.replayable_checkpoint_written === true && r25yEval?.checkpoint_validates === true,
      balanced_sampling_used: r25yDataset?.balanced_sampling_used === true,
      data_regularization_training: r25y.data_regularization_training === true,
      regularization_knobs: r25y.regularization_knobs || null,
      actual_layers: r25y.actual_layers ?? null,
      learning_rate: r25y.learning_rate ?? null,
      phase_4_scaled_training: false,
      blocked: r25y.skipped === true,
      blocked_reason: r25y.skipped ? r25y.reason || null : null
    });
  }

  if (INCLUDE_R25AC && r25ac) {
    runs.push({
      id: "R25AC",
      kind: "chinese_first_personal_microcycle",
      train_loss_change: r25ac.small_pilot_training_ran ? lossDelta(r25ac.initial_train_loss, r25ac.final_train_loss) : null,
      dev_loss_change: r25ac.small_pilot_training_ran ? lossDelta(r25ac.initial_dev_loss, r25ac.final_dev_loss) : null,
      heldout_loss: r25acHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25acHeldout?.heldout_loss_finite === true,
      heldout_language_counts: r25acHeldout?.heldout_language_counts || null,
      parameter_count: r25ac.parameter_count || null,
      sequence_count: r25ac.train_sequences || null,
      dev_sequence_count: r25ac.dev_sequences || null,
      heldout_sequence_count: r25acHeldout?.heldout_sequences ?? r25ac.heldout_sequences_prepared ?? null,
      steps: r25ac.steps || 0,
      backend: r25ac.backend,
      artifact_type: r25ac.small_pilot_training_ran ? "ignored_replayable_checkpoint_json" : "blocked_no_checkpoint",
      replayable_checkpoint_available: r25ac.replayable_checkpoint_written === true && r25acEval?.checkpoint_validates === true,
      actual_layers: r25ac.actual_layers ?? null,
      learning_rate: r25ac.learning_rate ?? null,
      actual_language_mix: r25ac.actual_language_mix || r25acDataset?.actual_train_language_mix || null,
      target_language_mix: r25acDataset?.target_language_mix || null,
      personal_target_coverage: r25ac.personal_target_coverage || r25acDataset?.personal_target_coverage || null,
      chinese_personal_breakdown_status: r25acBreakdown?.ok ? "ready" : "missing_or_not_ok",
      phase_4_scaled_training: false,
      blocked: r25ac.skipped === true,
      blocked_reason: r25ac.skipped ? r25ac.reason || null : null
    });
  }

  if (INCLUDE_R25AO && r25ao) {
    runs.push({
      id: "R25AO",
      kind: "expanded_chinese_first_personal_microcycle",
      train_loss_change: r25ao.small_pilot_training_ran ? lossDelta(r25ao.initial_train_loss, r25ao.final_train_loss) : null,
      dev_loss_change: r25ao.small_pilot_training_ran ? lossDelta(r25ao.initial_dev_loss, r25ao.final_dev_loss) : null,
      heldout_loss: r25aoHeldout?.heldout_loss ?? null,
      heldout_loss_finite: r25aoHeldout?.heldout_loss_finite === true,
      heldout_language_counts: r25aoHeldout?.heldout_language_counts || null,
      parameter_count: r25ao.parameter_count || null,
      sequence_count: r25ao.train_sequences || null,
      dev_sequence_count: r25ao.dev_sequences || null,
      heldout_sequence_count: r25aoHeldout?.heldout_sequences ?? r25ao.heldout_sequences_prepared ?? null,
      steps: r25ao.steps || 0,
      backend: r25ao.backend,
      artifact_type: r25ao.small_pilot_training_ran ? "ignored_replayable_checkpoint_json" : "blocked_no_checkpoint",
      replayable_checkpoint_available: r25ao.replayable_checkpoint_written === true && r25aoEval?.checkpoint_validates === true,
      actual_layers: r25ao.actual_layers ?? null,
      learning_rate: r25ao.learning_rate ?? null,
      actual_language_mix: r25ao.actual_language_mix || r25aoDataset?.actual_train_language_mix || null,
      target_language_mix: r25aoDataset?.target_language_mix || null,
      personal_target_coverage: r25ao.personal_target_coverage || r25aoDataset?.personal_target_coverage || null,
      chinese_personal_breakdown_status: r25aoBreakdown?.ok ? "ready" : "missing_or_not_ok",
      tokenizer_dry_run_ran: false,
      formal_decoder_training: false,
      phase_4_scaled_training: false,
      blocked: r25ao.skipped === true,
      blocked_reason: r25ao.skipped ? r25ao.reason || null : null
    });
  }

  const r25mRun = runs.find((run) => run.id === "R25M");
  const r25pRun = runs.find((run) => run.id === "R25P");
  const r25sRun = runs.find((run) => run.id === "R25S");
  const r25vRun = runs.find((run) => run.id === "R25V");
  const r25yRun = runs.find((run) => run.id === "R25Y");
  const r25acRun = runs.find((run) => run.id === "R25AC");
  const r25aoRun = runs.find((run) => run.id === "R25AO");
  const dataset_size_difference = r25mRun && r25pRun
    ? {
        train_sequences_delta: Number(r25pRun.sequence_count || 0) - Number(r25mRun.sequence_count || 0),
        dev_sequences_delta: Number(r25pRun.dev_sequence_count || 0) - Number(r25mRun.dev_sequence_count || 0)
      }
    : null;
  const r25s_vs_r25p = r25sRun && r25pRun
    ? {
        train_sequence_delta: Number(r25sRun.sequence_count || 0) - Number(r25pRun.sequence_count || 0),
        dev_sequence_delta: Number(r25sRun.dev_sequence_count || 0) - Number(r25pRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25sRun.heldout_sequence_count || 0) - Number(r25pRun.heldout_sequence_count || 0),
        final_train_loss_delta: Number(r25s?.final_train_loss) - Number(r25p?.final_train_loss),
        final_dev_loss_delta: Number(r25s?.final_dev_loss) - Number(r25p?.final_dev_loss),
        heldout_loss_delta: Number(r25sHeldout?.heldout_loss) - Number(r25pHeldout?.heldout_loss)
      }
    : null;
  const r25v_vs_r25s = r25vRun && r25sRun
    ? {
        train_sequence_delta: Number(r25vRun.sequence_count || 0) - Number(r25sRun.sequence_count || 0),
        dev_sequence_delta: Number(r25vRun.dev_sequence_count || 0) - Number(r25sRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25vRun.heldout_sequence_count || 0) - Number(r25sRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25vRun.parameter_count || 0) - Number(r25sRun.parameter_count || 0),
        final_train_loss_delta: Number(r25v?.final_train_loss) - Number(r25s?.final_train_loss),
        final_dev_loss_delta: Number(r25v?.final_dev_loss) - Number(r25s?.final_dev_loss),
        heldout_loss_delta: Number(r25vHeldout?.heldout_loss) - Number(r25sHeldout?.heldout_loss)
      }
    : null;
  const r25v_vs_r25p = r25vRun && r25pRun
    ? {
        train_sequence_delta: Number(r25vRun.sequence_count || 0) - Number(r25pRun.sequence_count || 0),
        dev_sequence_delta: Number(r25vRun.dev_sequence_count || 0) - Number(r25pRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25vRun.heldout_sequence_count || 0) - Number(r25pRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25vRun.parameter_count || 0) - Number(r25pRun.parameter_count || 0),
        final_train_loss_delta: Number(r25v?.final_train_loss) - Number(r25p?.final_train_loss),
        final_dev_loss_delta: Number(r25v?.final_dev_loss) - Number(r25p?.final_dev_loss),
        heldout_loss_delta: Number(r25vHeldout?.heldout_loss) - Number(r25pHeldout?.heldout_loss)
      }
    : null;
  const r25y_vs_r25s = r25yRun && r25sRun
    ? {
        train_sequence_delta: Number(r25yRun.sequence_count || 0) - Number(r25sRun.sequence_count || 0),
        dev_sequence_delta: Number(r25yRun.dev_sequence_count || 0) - Number(r25sRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25yRun.heldout_sequence_count || 0) - Number(r25sRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25yRun.parameter_count || 0) - Number(r25sRun.parameter_count || 0),
        final_train_loss_delta: Number(r25y?.final_train_loss) - Number(r25s?.final_train_loss),
        final_dev_loss_delta: Number(r25y?.final_dev_loss) - Number(r25s?.final_dev_loss),
        heldout_loss_delta: Number(r25yHeldout?.heldout_loss) - Number(r25sHeldout?.heldout_loss)
      }
    : null;
  const r25y_vs_r25v = r25yRun && r25vRun
    ? {
        parameter_count_delta: Number(r25yRun.parameter_count || 0) - Number(r25vRun.parameter_count || 0),
        final_train_loss_delta: Number(r25y?.final_train_loss) - Number(r25v?.final_train_loss),
        final_dev_loss_delta: Number(r25y?.final_dev_loss) - Number(r25v?.final_dev_loss),
        heldout_loss_delta: Number(r25yHeldout?.heldout_loss) - Number(r25vHeldout?.heldout_loss)
      }
    : null;
  const r25y_vs_r25p = r25yRun && r25pRun
    ? {
        train_sequence_delta: Number(r25yRun.sequence_count || 0) - Number(r25pRun.sequence_count || 0),
        dev_sequence_delta: Number(r25yRun.dev_sequence_count || 0) - Number(r25pRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25yRun.heldout_sequence_count || 0) - Number(r25pRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25yRun.parameter_count || 0) - Number(r25pRun.parameter_count || 0),
        final_train_loss_delta: Number(r25y?.final_train_loss) - Number(r25p?.final_train_loss),
        final_dev_loss_delta: Number(r25y?.final_dev_loss) - Number(r25p?.final_dev_loss),
        heldout_loss_delta: Number(r25yHeldout?.heldout_loss) - Number(r25pHeldout?.heldout_loss)
      }
    : null;
  const r25ac_vs_r25s = r25acRun && r25sRun
    ? {
        train_sequence_delta: Number(r25acRun.sequence_count || 0) - Number(r25sRun.sequence_count || 0),
        dev_sequence_delta: Number(r25acRun.dev_sequence_count || 0) - Number(r25sRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25acRun.heldout_sequence_count || 0) - Number(r25sRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25acRun.parameter_count || 0) - Number(r25sRun.parameter_count || 0),
        final_train_loss_delta: Number(r25ac?.final_train_loss) - Number(r25s?.final_train_loss),
        final_dev_loss_delta: Number(r25ac?.final_dev_loss) - Number(r25s?.final_dev_loss),
        heldout_loss_delta: Number(r25acHeldout?.heldout_loss) - Number(r25sHeldout?.heldout_loss),
        language_mix_delta: {
          zh: Number(r25acRun.actual_language_mix?.zh || 0) - 1 / 3,
          mixed: Number(r25acRun.actual_language_mix?.mixed || 0) - 1 / 3,
          en: Number(r25acRun.actual_language_mix?.en || 0) - 1 / 3
        }
      }
    : null;
  const r25ac_vs_r25y = r25acRun && r25yRun
    ? {
        final_train_loss_delta: Number(r25ac?.final_train_loss) - Number(r25y?.final_train_loss),
        final_dev_loss_delta: Number(r25ac?.final_dev_loss) - Number(r25y?.final_dev_loss),
        heldout_loss_delta: Number(r25acHeldout?.heldout_loss) - Number(r25yHeldout?.heldout_loss)
      }
    : null;
  const r25ac_vs_r25v = r25acRun && r25vRun
    ? {
        final_train_loss_delta: Number(r25ac?.final_train_loss) - Number(r25v?.final_train_loss),
        final_dev_loss_delta: Number(r25ac?.final_dev_loss) - Number(r25v?.final_dev_loss),
        heldout_loss_delta: Number(r25acHeldout?.heldout_loss) - Number(r25vHeldout?.heldout_loss)
      }
    : null;
  const r25ac_vs_r25p = r25acRun && r25pRun
    ? {
        final_train_loss_delta: Number(r25ac?.final_train_loss) - Number(r25p?.final_train_loss),
        final_dev_loss_delta: Number(r25ac?.final_dev_loss) - Number(r25p?.final_dev_loss),
        heldout_loss_delta: Number(r25acHeldout?.heldout_loss) - Number(r25pHeldout?.heldout_loss)
      }
    : null;
  const r25ao_vs_r25ac = r25aoRun && r25acRun
    ? {
        train_sequence_delta: Number(r25aoRun.sequence_count || 0) - Number(r25acRun.sequence_count || 0),
        dev_sequence_delta: Number(r25aoRun.dev_sequence_count || 0) - Number(r25acRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25aoRun.heldout_sequence_count || 0) - Number(r25acRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25aoRun.parameter_count || 0) - Number(r25acRun.parameter_count || 0),
        final_train_loss_delta: Number(r25ao?.final_train_loss) - Number(r25ac?.final_train_loss),
        final_dev_loss_delta: Number(r25ao?.final_dev_loss) - Number(r25ac?.final_dev_loss),
        heldout_loss_delta: Number(r25aoHeldout?.heldout_loss) - Number(r25acHeldout?.heldout_loss)
      }
    : null;
  const r25ao_vs_r25s = r25aoRun && r25sRun
    ? {
        train_sequence_delta: Number(r25aoRun.sequence_count || 0) - Number(r25sRun.sequence_count || 0),
        dev_sequence_delta: Number(r25aoRun.dev_sequence_count || 0) - Number(r25sRun.dev_sequence_count || 0),
        heldout_sequence_delta: Number(r25aoRun.heldout_sequence_count || 0) - Number(r25sRun.heldout_sequence_count || 0),
        parameter_count_delta: Number(r25aoRun.parameter_count || 0) - Number(r25sRun.parameter_count || 0),
        final_train_loss_delta: Number(r25ao?.final_train_loss) - Number(r25s?.final_train_loss),
        final_dev_loss_delta: Number(r25ao?.final_dev_loss) - Number(r25s?.final_dev_loss),
        heldout_loss_delta: Number(r25aoHeldout?.heldout_loss) - Number(r25sHeldout?.heldout_loss)
      }
    : null;
  const r25sRecommendation = INCLUDE_R25S
    ? chooseR25sRecommendation(r25s, r25sHeldout, r25p, r25pHeldout)
    : null;
  const r25vRecommendation = INCLUDE_R25V
    ? chooseR25vRecommendation(r25v, r25vHeldout, r25s, r25sHeldout)
    : null;
  const r25yRecommendation = INCLUDE_R25Y
    ? chooseR25yRecommendation(r25y, r25yHeldout, r25s, r25sHeldout)
    : null;
  const r25acRecommendation = INCLUDE_R25AC
    ? chooseR25acRecommendation(r25ac, r25acHeldout, r25s, r25sHeldout, r25acDataset)
    : null;
  const r25aoRecommendation = INCLUDE_R25AO
    ? chooseR25aoRecommendation(r25ao, r25aoHeldout, r25ac, r25acHeldout, r25s, r25sHeldout, r25aoDataset)
    : null;
  const recommendationCategory = DECISION_MODE
    ? INCLUDE_R25AO
      ? r25aoRecommendation
      : INCLUDE_R25AC
      ? r25acRecommendation
      : INCLUDE_R25Y
      ? r25yRecommendation
      : INCLUDE_R25V
      ? r25vRecommendation
      : INCLUDE_R25S
      ? r25sRecommendation
      : chooseDecisionRecommendation(r25pAnalysis, r25pRun)
    : INCLUDE_R25P
      ? "stop_and_review"
      : "future_r25p_requires_fresh_approval";

  const report = {
    ok: true,
    status: runs.length > 1 ? "history_compared" : runs.length === 1 ? "single_run_baseline" : "no_local_ignored_artifacts",
    decision_mode: DECISION_MODE,
    chinese_personal_review: CHINESE_PERSONAL_REVIEW,
    r25ap_review: R25AP_REVIEW,
    training_ran: false,
    product_model: false,
    release_checkpoint: false,
    runs,
    dataset_size_difference,
    r25s_vs_r25p,
    r25v_vs_r25s,
    r25v_vs_r25p,
    r25y_vs_r25s,
    r25y_vs_r25v,
    r25y_vs_r25p,
    r25ac_vs_r25s,
    r25ac_vs_r25y,
    r25ac_vs_r25v,
    r25ac_vs_r25p,
    r25ao_vs_r25ac,
    r25ao_vs_r25s,
    balanced_data_improved_weak_buckets: INCLUDE_R25S
      ? (Number.isFinite(Number(r25sHeldout?.heldout_loss)) && Number.isFinite(Number(r25pHeldout?.heldout_loss))
          ? Number(r25sHeldout.heldout_loss) <= Number(r25pHeldout.heldout_loss)
          : null)
      : null,
    two_layer_ablation_helped: INCLUDE_R25V
      ? (Number.isFinite(Number(r25vHeldout?.heldout_loss)) && Number.isFinite(Number(r25sHeldout?.heldout_loss))
          ? Number(r25vHeldout.heldout_loss) <= Number(r25sHeldout.heldout_loss)
          : null)
      : null,
    data_regularization_helped: INCLUDE_R25Y
      ? (Number.isFinite(Number(r25yHeldout?.heldout_loss)) && Number.isFinite(Number(r25sHeldout?.heldout_loss))
          ? Number(r25yHeldout.heldout_loss) <= Number(r25sHeldout.heldout_loss)
          : null)
      : null,
    chinese_first_personal_helped: INCLUDE_R25AC
      ? r25acRecommendation === "chinese_personal_helped_review_next"
      : null,
    expanded_chinese_first_personal_helped: INCLUDE_R25AO
      ? r25aoRecommendation === "expanded_chinese_personal_helped_review_next"
      : null,
    r25ad_interpretation: CHINESE_PERSONAL_REVIEW ? {
      language_mix_mechanism_worked: Boolean(
        r25acRun?.actual_language_mix &&
        Number(r25acRun.actual_language_mix.zh || 0) >= 0.7 &&
        Number(r25acRun.actual_language_mix.en || 0) <= 0.1
      ),
      r25s_remains_best_by_heldout_loss: Number.isFinite(Number(r25sHeldout?.heldout_loss)) &&
        [r25pHeldout, r25sHeldout, r25vHeldout, r25yHeldout, r25acHeldout]
          .filter(Boolean)
          .every((report) => Number(r25sHeldout.heldout_loss) <= Number(report.heldout_loss)),
      r25ac_quality_regressed_vs_r25s: Number.isFinite(Number(r25acHeldout?.heldout_loss)) &&
        Number.isFinite(Number(r25sHeldout?.heldout_loss)) &&
        Number(r25acHeldout.heldout_loss) > Number(r25sHeldout.heldout_loss),
      r25ae_corpus_expansion_preferred_before_repeat: true,
      phase_4_scaled_training_approved: false
    } : null,
    r25m_non_replayable_limitation: Boolean(r25mRun) ? "R25M stored a digest checkpoint and cannot provide true replayed held-out loss." : null,
    r25p_replayability: r25pRun?.replayable_checkpoint_available === true ? "replayable_checkpoint_available" : INCLUDE_R25P ? "not_available_or_not_validated" : "not_requested",
    recommendation_category: recommendationCategory,
    recommendation: DECISION_MODE
      ? INCLUDE_R25AO ? "stop_and_review_r25ao_before_any_repeat_tokenizer_or_phase_4_design_review" : CHINESE_PERSONAL_REVIEW ? "expand_chinese_personal_corpus_before_any_repeat_or_phase_4_design_review" : INCLUDE_R25AC ? "stop_and_review_before_any_repeat_or_phase_4_design_review" : INCLUDE_R25Y ? "stop_and_review_before_any_further_training_or_phase_4_scaling" : INCLUDE_R25V ? "stop_and_review_before_any_further_training_or_phase_4_scaling" : INCLUDE_R25S ? "stop_and_review_before_any_further_training_or_scaling" : "review_required_before_any_r25r_or_scaling"
      : INCLUDE_R25P ? "stop_and_review" : "future_r25p_requires_fresh_approval",
    notes: [
      DECISION_MODE
        ? INCLUDE_R25AO ? "R25AO history comparison does not train; it reads ignored reports only." : INCLUDE_R25AC ? "R25AC history comparison does not train; it reads ignored reports only." : INCLUDE_R25Y ? "R25Y history comparison does not train; it reads ignored reports only." : INCLUDE_R25V ? "R25V history comparison does not train; it reads ignored reports only." : INCLUDE_R25S ? "R25S history comparison does not train; it reads ignored reports only." : "R25Q decision comparison does not train; it reads ignored reports only."
        : INCLUDE_R25P ? "R25P comparison does not train; it reads ignored reports only." : "R25O comparison does not train.",
      "R25M is the first small-pilot baseline.",
      INCLUDE_R25AO
        ? "R25AO is a bounded expanded Chinese-first personal micro-cycle; another run, tokenizer dry-run, product step, or phase_4 scaling still requires review and fresh approval."
        : INCLUDE_R25AC
        ? "R25AC is a bounded Chinese-first personal micro-cycle; another run or phase_4 scaling still requires review and fresh approval."
        : INCLUDE_R25Y
        ? "R25Y is a bounded data-regularization pilot; another run or phase_4 scaling still requires review and fresh approval."
        : INCLUDE_R25V
        ? "R25V is a bounded architecture ablation pilot; another run or phase_4 scaling still requires review and fresh approval."
        : INCLUDE_R25S
        ? "R25S is a bounded data-first pilot; another run or phase_4 scaling still requires review and fresh approval."
        : DECISION_MODE
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
