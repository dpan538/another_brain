#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

async function exists(path) {
  try {
    await readFile(resolve(ROOT, path), "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
  } catch {
    return null;
  }
}

async function readJsonlCount(path) {
  try {
    const text = await readFile(resolve(ROOT, path), "utf8");
    return text.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch {
    return 0;
  }
}

async function main() {
  const required = [
    "docs/R25I_FROM_SCRATCH_LLM_TRAINING_DOCTRINE.md",
    "docs/R25I_TRAINING_PHASE_PLAN.md",
    "training/from_scratch/architectures/browser_decoder_v0.json",
    "training/from_scratch/tokenizer_corpus_manifest.json",
    "training/from_scratch/corpus_mix_v0.json",
    "static_llm/release_decisions/schema.json"
  ];
  const present = [];
  const missing = [];
  for (const path of required) {
    if (await exists(path)) present.push(path);
    else missing.push(path);
  }
  const tokenizerCorpusReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_corpus_report.json");
  const tokenizerReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_report.json");
  const tokenizerEvalReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_eval_report.json");
  const toyPlanReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25j_toy_training_plan_report.json");
  const toySkipReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25j_toy_overfit_skip_report.json");
  const toyDatasetReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_dataset_report.json");
  const toyRunReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json");
  const toyEvalReport = await readJsonIfPresent("artifacts/training_os/tiny_decoder_toy/r25k_toy_eval_report.json");
  const r25lTrainRows = await readJsonlCount("training/llm_corpus/r25l_train.jsonl");
  const r25lDevRows = await readJsonlCount("training/llm_corpus/r25l_dev.jsonl");
  const r25lHeldoutRows = await readJsonlCount("training/llm_corpus/r25l_heldout.jsonl");
  const r25lTokenizerCorpusReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_corpus_report.json");
  const r25lTokenizerReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_report.json");
  const r25lTokenizerEvalReport = await readJsonIfPresent("artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_eval_report.json");
  const smallPilotPlanReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25l_small_decoder_pilot_plan.json");
  const smallPilotSkipReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25l_small_decoder_pilot_skip_report.json");
  const smallPilotBackendReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_numeric_backend_report.json");
  const smallPilotDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_dataset_report.json");
  const smallPilotRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json");
  const smallPilotEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_eval_report.json");
  const r25kApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json");
  const r25mApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json");
  const smallPilotAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json");
  const smallPilotHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json");
  const smallPilotDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25n/r25n_next_pilot_decision.json");
  const r25pApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.template.json");
  const secondPilotPlanReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25o/r25o_second_pilot_plan.json");
  const checkpointSchemaReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25o/r25o_checkpoint_schema_report.json");
  const replayHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25o/r25o_replay_heldout_eval_report.json");
  const historyComparisonReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25o/r25o_history_comparison.json");
  const r25pApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json");
  const r25pDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_dataset_report.json");
  const r25pRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json");
  const r25pEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_eval_report.json");
  const r25pHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json");
  const r25pHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25p/r25p_history_comparison.json");
  const r25pAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json");
  const r25pReplayDeterminismReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_replay_determinism_report.json");
  const r25pHeldoutBreakdownReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json");
  const r25qHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_history_comparison.json");
  const r25qDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25q/r25q_next_step_decision.json");
  const r25rApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25R_NEXT_SMALL_PILOT.template.json");
  const r25sSamplingConfig = await readJsonIfPresent("training/from_scratch/small_decoder_r25s_sampling_config.json");
  const r25sRunConfigTemplate = await readJsonIfPresent("training/from_scratch/small_decoder_pilot_run_config.r25s.template.json");
  const r25sApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json");
  const r25sSamplingPlan = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json");
  const r25rDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25r/r25r_decision_report.json");
  const r25sApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.json");
  const r25sDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_dataset_report.json");
  const r25sRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json");
  const r25sEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_eval_report.json");
  const r25sHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json");
  const r25sHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25s/r25s_history_comparison.json");
  const r25uApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25U_ARCHITECTURE_ABLATION.template.json");
  const r25sAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json");
  const r25sHeldoutBreakdownReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json");
  const r25tComparisonReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_r25p_r25s_generalization.json");
  const r25tDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json");
  const phase3ExitCriteria = await readJsonIfPresent("training/from_scratch/phase3_exit_criteria.json");
  const phase4ReadinessReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25u/r25u_phase4_readiness_report.json");
  const architectureAblationPlan = await readJsonIfPresent("training/from_scratch/architecture_ablation_plan.r25u.json");
  const architectureAblationReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25u/r25u_architecture_ablation_plan.json");
  const r25uPhaseDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25u/r25u_phase_decision_report.json");
  const r25vApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25V_NEXT_PILOT.template.json");
  const r25vApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json");
  const r25vDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_dataset_report.json");
  const r25vRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json");
  const r25vEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_eval_report.json");
  const r25vHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json");
  const r25vHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25v/r25v_history_comparison.json");
  const r25vAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_analysis.json");
  const r25vHeldoutBreakdownReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_heldout_breakdown.json");
  const dataVsArchitectureReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_data_vs_architecture_comparison.json");
  const phase3DecisionLedger = await readJsonIfPresent("training/from_scratch/phase3_decision_ledger.json");
  const r25wDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25w/r25w_next_step_decision.json");
  const r25xApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25X_FUTURE_PILOT.template.json");
  const r25xPhase3ReviewLedger = await readJsonIfPresent("training/from_scratch/phase3_review_ledger.r25x.json");
  const r25xDataQualityAudit = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_data_quality_audit.json");
  const r25xBestPilotRows = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_r25s_best_rows.json");
  const r25yDataRegularizationConfig = await readJsonIfPresent("training/from_scratch/small_decoder_r25y_data_regularization_config.json");
  const r25yRunConfigTemplate = await readJsonIfPresent("training/from_scratch/small_decoder_pilot_run_config.r25y.template.json");
  const r25yApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json");
  const r25xPhase3ReviewReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_phase3_review_report.json");
  const tokenizerDryrunOk = Boolean(tokenizerCorpusReport?.ok && tokenizerReport?.ok && tokenizerEvalReport?.ok);
  const r25lCorpusOk = r25lTrainRows >= 1600 && r25lDevRows >= 400 && r25lHeldoutRows >= 400;
  const r25lTokenizerDryrunOk = Boolean(r25lTokenizerCorpusReport?.ok && r25lTokenizerReport?.ok && r25lTokenizerEvalReport?.ok);
  const toyPipelineOk = Boolean(toyPlanReport?.ok && toySkipReport?.ok && toySkipReport?.skipped === true);
  const toyOverfitOk = Boolean(
    toyDatasetReport?.ok &&
    toyRunReport?.ok &&
    toyRunReport?.toy_training_ran === true &&
    toyRunReport?.formal_training === false &&
    toyRunReport?.product_model === false &&
    toyRunReport?.loss_decreased === true &&
    toyEvalReport?.ok
  );
  const smallPilotPlanOk = Boolean(
    smallPilotPlanReport?.ok &&
    smallPilotPlanReport?.training_will_run === false &&
    smallPilotPlanReport?.product_model === false
  );
  const smallPilotTrainingSkipped = Boolean(
    smallPilotSkipReport?.ok &&
    smallPilotSkipReport?.skipped === true &&
    smallPilotSkipReport?.training_ran === false
  );
  const r25lReadyForReview = Boolean(r25lCorpusOk && r25lTokenizerDryrunOk && smallPilotPlanOk && smallPilotTrainingSkipped);
  const smallPilotRanOk = Boolean(
    smallPilotDatasetReport?.ok &&
    smallPilotRunReport?.ok &&
    smallPilotRunReport?.small_pilot_training_ran === true &&
    smallPilotRunReport?.formal_product_training === false &&
    smallPilotRunReport?.long_term_training === false &&
    smallPilotRunReport?.product_model === false &&
    smallPilotRunReport?.release_checkpoint === false &&
    smallPilotRunReport?.train_loss_decreased === true &&
    smallPilotRunReport?.dev_loss_finite === true &&
    smallPilotEvalReport?.ok
  );
  const smallPilotBlocked = Boolean(
    smallPilotBackendReport?.can_run_small_pilot === false &&
    smallPilotRunReport?.small_pilot_training_ran === false &&
    smallPilotEvalReport?.ok
  );
  const smallPilotArtifactsUntracked = Boolean(smallPilotEvalReport?.ok && smallPilotEvalReport?.weights_tracked === false);
  const approvalMarkersConsumedOk = Boolean(
    r25kApproval?.consumed === true &&
    r25kApproval?.allow_additional_runs === false &&
    r25mApproval?.consumed === true &&
    r25mApproval?.allow_additional_runs === false &&
    (!r25pApproval || (r25pApproval?.consumed === true && r25pApproval?.allow_additional_runs === false)) &&
    (!r25sApproval || (r25sApproval?.consumed === true && r25sApproval?.allow_additional_runs === false)) &&
    (!r25vApproval || (r25vApproval?.consumed === true && r25vApproval?.allow_additional_runs === false))
  );
  const activeTrainingApprovalCount = [
    r25kApproval?.approved && r25kApproval?.consumed !== true && r25kApproval?.scope === "toy_overfit_sanity_only",
    r25mApproval?.approved && r25mApproval?.consumed !== true && r25mApproval?.allow_small_pilot_training === true,
    r25pApproval?.approved && r25pApproval?.consumed !== true && r25pApproval?.allow_small_pilot_training === true,
    r25sApproval?.approved && r25sApproval?.consumed !== true && r25sApproval?.allow_small_pilot_training === true,
    r25vApproval?.approved && r25vApproval?.consumed !== true && (r25vApproval?.allow_small_pilot_training === true || r25vApproval?.allow_architecture_ablation_training === true || r25vApproval?.allow_phase_4_scaled_training === true),
    r25rApprovalTemplate?.approved && r25rApprovalTemplate?.allow_small_pilot_training === true,
    r25sApprovalTemplate?.approved && r25sApprovalTemplate?.allow_small_pilot_training === true,
    r25uApprovalTemplate?.approved && (r25uApprovalTemplate?.allow_small_pilot_training === true || r25uApprovalTemplate?.allow_architecture_ablation_training === true || r25uApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25vApprovalTemplate?.approved && (r25vApprovalTemplate?.allow_small_pilot_training === true || r25vApprovalTemplate?.allow_architecture_ablation_training === true || r25vApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25xApprovalTemplate?.approved && (r25xApprovalTemplate?.allow_small_pilot_training === true || r25xApprovalTemplate?.allow_data_refinement_training === true || r25xApprovalTemplate?.allow_architecture_ablation_training === true || r25xApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25yApprovalTemplate?.approved && (r25yApprovalTemplate?.allow_small_pilot_training === true || r25yApprovalTemplate?.allow_data_regularization_training === true || r25yApprovalTemplate?.allow_phase_4_scaled_training === true)
  ].filter(Boolean).length;
  const activeProductTrainingApprovalCount = [
    r25kApproval?.consumed !== true && r25kApproval?.allow_product_model_training === true,
    r25mApproval?.consumed !== true && r25mApproval?.allow_product_model_training === true,
    r25pApproval?.consumed !== true && r25pApproval?.allow_product_model_training === true,
    r25sApproval?.consumed !== true && r25sApproval?.allow_product_model_training === true,
    r25vApproval?.consumed !== true && r25vApproval?.allow_product_model_training === true,
    r25rApprovalTemplate?.allow_product_model_training === true,
    r25sApprovalTemplate?.allow_product_model_training === true,
    r25uApprovalTemplate?.allow_product_model_training === true,
    r25vApprovalTemplate?.allow_product_model_training === true,
    r25xApprovalTemplate?.allow_product_model_training === true,
    r25yApprovalTemplate?.allow_product_model_training === true
  ].filter(Boolean).length;
  const activeWeightCommitApprovalCount = [
    r25kApproval?.consumed !== true && r25kApproval?.allow_weight_commit === true,
    r25mApproval?.consumed !== true && r25mApproval?.allow_weight_commit === true,
    r25pApproval?.consumed !== true && r25pApproval?.allow_weight_commit === true,
    r25sApproval?.consumed !== true && r25sApproval?.allow_weight_commit === true,
    r25vApproval?.consumed !== true && r25vApproval?.allow_weight_commit === true,
    r25rApprovalTemplate?.allow_weight_commit === true,
    r25sApprovalTemplate?.allow_weight_commit === true,
    r25uApprovalTemplate?.allow_weight_commit === true,
    r25vApprovalTemplate?.allow_weight_commit === true,
    r25xApprovalTemplate?.allow_weight_commit === true,
    r25yApprovalTemplate?.allow_weight_commit === true
  ].filter(Boolean).length;
  const smallPilotEvaluationOk = Boolean(
    smallPilotAnalysisReport?.ok &&
    smallPilotHeldoutReport?.ok &&
    smallPilotDecisionReport?.ok &&
    approvalMarkersConsumedOk &&
    activeTrainingApprovalCount === 0
  );
  const r25pApprovalTemplateSafe = Boolean(
    r25pApprovalTemplate?.approved === false &&
    r25pApprovalTemplate?.allow_small_pilot_training === false &&
    r25pApprovalTemplate?.allow_product_model_training === false &&
    r25pApprovalTemplate?.allow_weight_commit === false
  );
  const r25oDesignOk = Boolean(
    secondPilotPlanReport?.ok &&
    secondPilotPlanReport?.training_will_run === false &&
    secondPilotPlanReport?.fresh_approval_required === true &&
    checkpointSchemaReport?.ok &&
    replayHeldoutReport?.ok &&
    historyComparisonReport?.ok &&
    r25pApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25pRunOk = Boolean(
    r25pDatasetReport?.ok &&
    r25pRunReport?.ok &&
    r25pRunReport?.run_id === "r25p_more_sequences_128" &&
    r25pRunReport?.variant_id === "r25p_more_sequences_128" &&
    r25pRunReport?.small_pilot_training_ran === true &&
    r25pRunReport?.formal_product_training === false &&
    r25pRunReport?.long_term_training === false &&
    r25pRunReport?.product_model === false &&
    r25pRunReport?.release_checkpoint === false &&
    r25pRunReport?.train_loss_decreased === true &&
    r25pRunReport?.dev_loss_finite === true &&
    r25pRunReport?.replayable_checkpoint_written === true &&
    r25pEvalReport?.ok
  );
  const r25pHeldoutOk = Boolean(
    r25pHeldoutReport?.ok &&
    r25pHeldoutReport?.heldout_loss_finite === true &&
    r25pHeldoutReport?.train_dev_heldout_overlap === false
  );
  const r25pCompleteOk = Boolean(
    r25pRunOk &&
    r25pHeldoutOk &&
    r25pApproval?.consumed === true &&
    activeTrainingApprovalCount === 0 &&
    activeProductTrainingApprovalCount === 0 &&
    activeWeightCommitApprovalCount === 0
  );
  const r25rApprovalTemplateSafe = Boolean(
    r25rApprovalTemplate?.approved === false &&
    r25rApprovalTemplate?.allow_small_pilot_training === false &&
    r25rApprovalTemplate?.allow_product_model_training === false &&
    r25rApprovalTemplate?.allow_weight_commit === false
  );
  const r25qAnalysisOk = Boolean(
    r25pCompleteOk &&
    r25pAnalysisReport?.ok &&
    r25pAnalysisReport?.classification !== "invalid" &&
    r25pReplayDeterminismReport?.ok &&
    (r25pReplayDeterminismReport?.deterministic === true || r25pReplayDeterminismReport?.status === "deterministic") &&
    r25pHeldoutBreakdownReport?.ok &&
    r25qHistoryReport?.ok &&
    r25qDecisionReport?.ok &&
    r25rApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25sApprovalTemplateSafe = Boolean(
    r25sApprovalTemplate?.approved === false &&
    r25sApprovalTemplate?.allow_small_pilot_training === false &&
    r25sApprovalTemplate?.allow_product_model_training === false &&
    r25sApprovalTemplate?.allow_weight_commit === false
  );
  const r25sDesignOk = Boolean(
    r25sSamplingConfig?.training_allowed_by_default === false &&
    r25sSamplingConfig?.requires_fresh_approval === true &&
    r25sSamplingConfig?.product_model === false &&
    r25sSamplingConfig?.release_checkpoint === false &&
    r25sRunConfigTemplate?.approved_by_default === false &&
    r25sRunConfigTemplate?.approval_required === true &&
    r25sRunConfigTemplate?.product_model === false &&
    r25sRunConfigTemplate?.release_checkpoint === false &&
    r25sApprovalTemplateSafe &&
    r25sSamplingPlan?.ok &&
    r25sSamplingPlan?.training_will_run === false &&
    r25rDecisionReport?.ok &&
    r25rDecisionReport?.recommendation === "prepare_r25s_with_fresh_approval" &&
    activeTrainingApprovalCount === 0
  );
  const r25sRunOk = Boolean(
    r25sDatasetReport?.ok &&
    r25sRunReport?.ok &&
    r25sRunReport?.run_id === "r25s_data_first_balanced_192" &&
    r25sRunReport?.variant_id === "r25s_data_first_balanced_192" &&
    r25sRunReport?.small_pilot_training_ran === true &&
    r25sRunReport?.formal_product_training === false &&
    r25sRunReport?.long_term_training === false &&
    r25sRunReport?.phase_4_scaled_training === false &&
    r25sRunReport?.product_model === false &&
    r25sRunReport?.release_checkpoint === false &&
    r25sRunReport?.train_loss_decreased === true &&
    r25sRunReport?.dev_loss_finite === true &&
    r25sRunReport?.replayable_checkpoint_written === true &&
    r25sEvalReport?.ok
  );
  const r25sHeldoutOk = Boolean(
    r25sHeldoutReport?.ok &&
    r25sHeldoutReport?.heldout_loss_finite === true &&
    r25sHeldoutReport?.train_dev_heldout_overlap === false
  );
  const r25sCompleteOk = Boolean(
    r25sRunOk &&
    r25sHeldoutOk &&
    r25sApproval?.consumed === true &&
    activeTrainingApprovalCount === 0 &&
    activeProductTrainingApprovalCount === 0 &&
    activeWeightCommitApprovalCount === 0
  );
  const r25uApprovalTemplateSafe = Boolean(
    r25uApprovalTemplate?.approved === false &&
    r25uApprovalTemplate?.allow_small_pilot_training === false &&
    r25uApprovalTemplate?.allow_architecture_ablation_training === false &&
    r25uApprovalTemplate?.allow_product_model_training === false &&
    r25uApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25uApprovalTemplate?.allow_weight_commit === false
  );
  const r25tAnalysisOk = Boolean(
    r25sCompleteOk &&
    r25sAnalysisReport?.ok &&
    r25sAnalysisReport?.classification !== "invalid" &&
    r25sHeldoutBreakdownReport?.ok &&
    r25tComparisonReport?.ok &&
    r25tDecisionReport?.ok &&
    r25uApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25vApprovalTemplateSafe = Boolean(
    r25vApprovalTemplate?.approved === false &&
    r25vApprovalTemplate?.allow_small_pilot_training === false &&
    r25vApprovalTemplate?.allow_architecture_ablation_training === false &&
    r25vApprovalTemplate?.allow_product_model_training === false &&
    r25vApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25vApprovalTemplate?.allow_weight_commit === false
  );
  const r25uPlanningOk = Boolean(
    r25tAnalysisOk &&
    phase3ExitCriteria?.phase4_approved === false &&
    phase3ExitCriteria?.reviewer_approval_required_before_phase4 === true &&
    phase4ReadinessReport?.ok &&
    phase4ReadinessReport?.phase4_approved === false &&
    phase4ReadinessReport?.ready === false &&
    architectureAblationPlan?.training_allowed_by_default === false &&
    architectureAblationPlan?.requires_fresh_approval === true &&
    architectureAblationPlan?.product_model === false &&
    architectureAblationPlan?.release_checkpoint === false &&
    architectureAblationReport?.ok &&
    architectureAblationReport?.training_will_run === false &&
    r25uPhaseDecisionReport?.ok &&
    r25uPhaseDecisionReport?.phase4_approved === false &&
    r25uPhaseDecisionReport?.fresh_approval_required === true &&
    r25vApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25vRunOk = Boolean(
    r25vDatasetReport?.ok &&
    r25vRunReport?.ok &&
    r25vRunReport?.run_id === "r25v_two_layer_same_width" &&
    r25vRunReport?.variant_id === "two_layer_same_width" &&
    r25vRunReport?.small_pilot_training_ran === true &&
    r25vRunReport?.architecture_ablation_training === true &&
    Number(r25vRunReport?.actual_layers) === 2 &&
    r25vRunReport?.formal_product_training === false &&
    r25vRunReport?.long_term_training === false &&
    r25vRunReport?.phase_4_scaled_training === false &&
    r25vRunReport?.product_model === false &&
    r25vRunReport?.release_checkpoint === false &&
    r25vRunReport?.train_loss_decreased === true &&
    r25vRunReport?.dev_loss_finite === true &&
    r25vRunReport?.replayable_checkpoint_written === true &&
    r25vEvalReport?.ok
  );
  const r25vHeldoutOk = Boolean(
    r25vHeldoutReport?.ok &&
    r25vHeldoutReport?.heldout_loss_finite === true &&
    r25vHeldoutReport?.train_dev_heldout_overlap === false
  );
  const r25vBlockedOk = Boolean(
    r25vRunReport?.ok === true &&
    r25vRunReport?.skipped === true &&
    r25vRunReport?.small_pilot_training_ran === false &&
    String(r25vRunReport?.reason || "").includes("unsupported_backend") &&
    r25vApproval?.consumed === true &&
    activeTrainingApprovalCount === 0
  );
  const r25vCompleteOk = Boolean(
    r25vRunOk &&
    r25vHeldoutOk &&
    r25vApproval?.consumed === true &&
    activeTrainingApprovalCount === 0 &&
    activeProductTrainingApprovalCount === 0 &&
    activeWeightCommitApprovalCount === 0
  );
  const r25xApprovalTemplateSafe = Boolean(
    r25xApprovalTemplate?.approved === false &&
    r25xApprovalTemplate?.allow_small_pilot_training === false &&
    r25xApprovalTemplate?.allow_data_refinement_training === false &&
    r25xApprovalTemplate?.allow_architecture_ablation_training === false &&
    r25xApprovalTemplate?.allow_product_model_training === false &&
    r25xApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25xApprovalTemplate?.allow_weight_commit === false
  );
  const r25wAnalysisOk = Boolean(
    r25vCompleteOk &&
    r25vAnalysisReport?.ok &&
    r25vAnalysisReport?.ablation_result !== "invalid" &&
    r25vHeldoutBreakdownReport?.ok &&
    dataVsArchitectureReport?.ok &&
    dataVsArchitectureReport?.phase4_approved === false &&
    phase3DecisionLedger?.phase4_scaled_training_approved === false &&
    r25wDecisionReport?.ok &&
    r25wDecisionReport?.phase4_approved === false &&
    r25xApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25yApprovalTemplateSafe = Boolean(
    r25yApprovalTemplate?.approved === false &&
    r25yApprovalTemplate?.allow_small_pilot_training === false &&
    r25yApprovalTemplate?.allow_data_regularization_training === false &&
    r25yApprovalTemplate?.allow_product_model_training === false &&
    r25yApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25yApprovalTemplate?.allow_weight_commit === false
  );
  const r25yDesignOk = Boolean(
    r25yDataRegularizationConfig?.training_allowed_by_default === false &&
    r25yDataRegularizationConfig?.requires_fresh_approval === true &&
    r25yDataRegularizationConfig?.product_model === false &&
    r25yDataRegularizationConfig?.release_checkpoint === false &&
    r25yDataRegularizationConfig?.phase_4_scaled_training === false &&
    r25yDataRegularizationConfig?.commit_weights_allowed === false &&
    r25yDataRegularizationConfig?.architecture?.basis === "r25s_baseline_data_first" &&
    Number(r25yDataRegularizationConfig?.architecture?.layers) === 1 &&
    r25yRunConfigTemplate?.training_allowed_by_default === false &&
    r25yRunConfigTemplate?.product_model === false &&
    r25yRunConfigTemplate?.release_checkpoint === false &&
    r25yRunConfigTemplate?.phase_4_scaled_training === false &&
    r25yRunConfigTemplate?.commit_weights_allowed === false &&
    r25yRunConfigTemplate?.output_dir === "artifacts/training_os/small_decoder_pilot/r25y/" &&
    r25yApprovalTemplateSafe
  );
  const r25xReviewOk = Boolean(
    r25wAnalysisOk &&
    r25xPhase3ReviewLedger?.phase4_scaled_training_approved === false &&
    r25xPhase3ReviewLedger?.next_training_requires_fresh_approval === true &&
    r25xDataQualityAudit?.ok &&
    r25xBestPilotRows?.ok &&
    r25yDesignOk &&
    r25xPhase3ReviewReport?.ok &&
    r25xPhase3ReviewReport?.phase_4_scaled_training_approved === false &&
    r25xPhase3ReviewReport?.fresh_approval_required === true &&
    activeTrainingApprovalCount === 0
  );

  const report = {
    ok: missing.length === 0,
    training_started: false,
    formal_decoder_training_started: false,
    product_model_exists: false,
    formal_training_progress_percent: 0,
    product_training_progress_percent: 0,
    pilot_training_progress_percent: r25vCompleteOk ? 4 : r25sCompleteOk ? 3 : r25pCompleteOk ? 2 : smallPilotRanOk ? 1 : 0,
    from_scratch_program_progress_percent: r25vCompleteOk ? 6 : r25sCompleteOk ? 5 : r25pCompleteOk ? 4 : smallPilotRanOk ? 3 : r25lReadyForReview ? 2 : toyOverfitOk ? 1 : 0,
    training_readiness_percent_estimate: r25xReviewOk ? 73 : r25wAnalysisOk ? 72 : r25vCompleteOk ? 72 : r25vBlockedOk ? 70 : r25uPlanningOk ? 70 : r25tAnalysisOk ? 69 : r25sCompleteOk ? 68 : r25sDesignOk ? 67 : r25qAnalysisOk ? 66 : r25pCompleteOk ? 65 : r25oDesignOk ? 63 : smallPilotEvaluationOk ? 62 : smallPilotRanOk ? 60 : r25lReadyForReview ? 55 : toyOverfitOk ? 50 : tokenizerDryrunOk && toyPipelineOk ? 45 : 40,
    browser_product_completion_estimate: r25vCompleteOk ? 32 : r25vBlockedOk ? 31 : r25uPlanningOk ? 31 : r25tAnalysisOk ? 31 : r25sCompleteOk ? 31 : r25pCompleteOk ? 30 : smallPilotRanOk ? 29 : r25lReadyForReview ? 28 : toyOverfitOk ? 27 : tokenizerDryrunOk && toyPipelineOk ? 26 : 25,
    current_phase: r25xReviewOk ? "phase_3_review_and_data_regularization_designed" : r25wAnalysisOk ? "phase_3_architecture_ablation_analyzed" : r25vCompleteOk ? "phase_3_architecture_ablation_pilot_completed" : r25vBlockedOk ? "phase_3_architecture_ablation_pilot_blocked" : r25uPlanningOk ? "phase_3_exit_criteria_and_ablation_planned" : r25tAnalysisOk ? "phase_3_data_first_pilot_analyzed" : r25sCompleteOk ? "phase_3_data_first_third_pilot_completed" : r25sDesignOk ? "phase_3_data_first_third_pilot_designed" : r25qAnalysisOk ? "phase_3_second_small_pilot_analyzed" : r25pCompleteOk ? "phase_3_second_small_pilot_completed" : r25oDesignOk ? "phase_3_second_small_pilot_designed" : smallPilotEvaluationOk ? "phase_3_small_decoder_pilot_evaluated" : smallPilotRanOk ? "phase_3_small_decoder_pilot" : r25lReadyForReview ? "phase_3_small_decoder_pilot_planned" : toyOverfitOk ? "phase_2_tiny_overfit_sanity" : tokenizerDryrunOk ? "phase_1_tokenizer_dry_run" : "phase_0_no_training_current",
    approval_markers_consumed_status: approvalMarkersConsumedOk ? "consumed_one_shot_markers_inert" : "needs_review",
    active_training_approval_count: activeTrainingApprovalCount,
    active_product_training_approval_count: activeProductTrainingApprovalCount,
    active_weight_commit_approval_count: activeWeightCommitApprovalCount,
    tokenizer_dryrun_status: tokenizerDryrunOk ? "passed_local_dryrun" : "not_complete",
    tokenizer_corpus_status: tokenizerCorpusReport?.ok ? {
      train_chars: tokenizerCorpusReport.train_chars,
      dev_chars: tokenizerCorpusReport.dev_chars,
      heldout_chars: tokenizerCorpusReport.heldout_chars
    } : "not_built",
    toy_decoder_pipeline_status: toyPipelineOk ? "planned_and_default_skip_passed" : "not_complete",
    toy_overfit_status: toyOverfitOk ? "passed_toy_only_sanity" : toyRunReport?.toy_training_ran ? "toy_run_needs_review" : "not_run",
    toy_overfit_last_run: toyRunReport?.ok ? "r25k_toy_run_report.json" : null,
    toy_loss_decreased: toyRunReport?.loss_decreased === true,
    toy_artifacts_untracked: toyEvalReport?.ok === true && toyEvalReport?.weights_tracked === false,
    toy_model_type: toyRunReport?.toy_training_ran ? "trainable_bigram_next_token_toy" : null,
    toy_metrics: toyRunReport?.toy_training_ran ? {
      steps: toyRunReport.steps,
      initial_loss: toyRunReport.initial_loss,
      final_loss: toyRunReport.final_loss,
      train_accuracy_proxy: toyRunReport.train_accuracy_proxy
    } : null,
    r25l_expanded_corpus_status: r25lCorpusOk ? "generated_split_separated" : "not_complete",
    r25l_corpus_rows: {
      train: r25lTrainRows,
      dev: r25lDevRows,
      heldout: r25lHeldoutRows,
      total: r25lTrainRows + r25lDevRows + r25lHeldoutRows
    },
    r25l_corpus_coverage_status: r25lCorpusOk ? "coverage_targets_met" : "not_complete",
    r25l_tokenizer_dryrun_status: r25lTokenizerDryrunOk ? "passed_expanded_corpus_dryrun" : "not_complete",
    r25l_tokenizer_eval_summary: r25lTokenizerEvalReport?.ok ? {
      tokenizer_id: r25lTokenizerEvalReport.tokenizer_id,
      vocab_size: r25lTokenizerEvalReport.vocab_size,
      unknown_rate: r25lTokenizerEvalReport.unknown_rate,
      avg_chars_per_token: r25lTokenizerEvalReport.avg_chars_per_token,
      warnings: r25lTokenizerEvalReport.warnings || []
    } : null,
    small_decoder_pilot_plan_status: smallPilotPlanOk ? "planned_no_training" : "not_complete",
    small_decoder_pilot_training_status: smallPilotRanOk ? "bounded_pilot_ran_to_ignored_artifacts" : smallPilotBlocked ? "blocked_missing_numeric_backend" : smallPilotTrainingSkipped ? "skipped_default_approval_required" : "not_run",
    small_decoder_pilot_status: smallPilotRanOk ? "passed_bounded_phase_3_pilot" : smallPilotBlocked ? "blocked_no_numeric_backend" : smallPilotTrainingSkipped ? "planned_skip_only" : "not_complete",
    small_decoder_pilot_backend: smallPilotRunReport?.backend || smallPilotBackendReport?.backend || null,
    small_decoder_pilot_loss_decreased: smallPilotRunReport?.train_loss_decreased === true,
    small_decoder_pilot_artifacts_untracked: smallPilotArtifactsUntracked,
    small_decoder_pilot_product_model: false,
    small_pilot_analysis_status: smallPilotAnalysisReport?.ok ? smallPilotAnalysisReport.classification || "passed" : smallPilotAnalysisReport?.status || "not_run",
    small_pilot_heldout_status: smallPilotHeldoutReport?.ok ? (smallPilotHeldoutReport.skipped ? "skipped_ignored_artifacts_missing" : "passed_structural_eval") : "not_run",
    small_pilot_decision_status: smallPilotDecisionReport?.ok ? smallPilotDecisionReport.recommendation : "not_run",
    r25o_second_pilot_plan_status: secondPilotPlanReport?.ok ? `planned_${secondPilotPlanReport.recommended_variant}` : "not_run",
    replayable_checkpoint_protocol_status: checkpointSchemaReport?.ok ? (checkpointSchemaReport.r25m_checkpoint_replayable ? "needs_review" : "schema_valid_r25m_legacy_digest_non_replayable") : "not_run",
    replay_heldout_eval_status: replayHeldoutReport?.ok ? (replayHeldoutReport.skipped ? replayHeldoutReport.reason : "ready_for_replayable_checkpoint") : "not_run",
    small_pilot_history_comparison_status: historyComparisonReport?.ok ? historyComparisonReport.status : "not_run",
    r25p_run_status: r25pRunOk ? "passed_second_bounded_pilot" : r25pRunReport?.small_pilot_training_ran ? "needs_review" : "not_run",
    r25p_variant: r25pRunReport?.variant_id || r25pApproval?.variant_id || null,
    r25p_train_loss_decreased: r25pRunReport?.train_loss_decreased === true,
    r25p_dev_loss_finite: r25pRunReport?.dev_loss_finite === true,
    r25p_heldout_loss_status: r25pHeldoutOk ? "finite_replay_loss" : r25pHeldoutReport?.ok ? "needs_review" : "not_run",
    r25p_heldout_loss: Number.isFinite(Number(r25pHeldoutReport?.heldout_loss)) ? r25pHeldoutReport.heldout_loss : null,
    r25p_replayable_checkpoint_status: r25pEvalReport?.checkpoint_validates ? "valid_ignored_replayable_checkpoint" : r25pRunReport?.replayable_checkpoint_written ? "written_needs_validation" : "not_written",
    r25p_approval_consumed_status: r25pApproval?.consumed === true ? "consumed_one_shot_marker_inert" : r25pApproval?.approved ? "active_needs_consumption_after_run" : "not_present_or_not_approved",
    r25p_history_comparison_status: r25pHistoryReport?.ok ? r25pHistoryReport.status : "not_run",
    r25p_analysis_status: r25pAnalysisReport?.ok ? r25pAnalysisReport.classification : r25pAnalysisReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25p_overfit_risk: r25pAnalysisReport?.overfit_risk || "not_run",
    r25p_replay_determinism_status: r25pReplayDeterminismReport?.ok ? ((r25pReplayDeterminismReport.deterministic || r25pReplayDeterminismReport.status === "deterministic") ? "deterministic_replay_passed" : "needs_review") : r25pReplayDeterminismReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25p_heldout_breakdown_status: r25pHeldoutBreakdownReport?.ok ? (r25pHeldoutBreakdownReport.skipped ? "skipped_ignored_artifacts_missing" : "breakdown_ready") : "not_run",
    r25q_history_comparison_status: r25qHistoryReport?.ok ? r25qHistoryReport.status : "not_run",
    r25q_recommendation: r25qDecisionReport?.ok ? r25qDecisionReport.recommendation : "not_run",
    r25r_approval_template_status: r25rApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25r_sampling_plan_status: r25sSamplingPlan?.ok ? "balanced_sampling_plan_ready" : "not_run",
    r25s_approval_template_status: r25sApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25s_design_status: r25sDesignOk ? "data_first_design_validated" : "not_complete",
    r25r_recommendation: r25rDecisionReport?.ok ? r25rDecisionReport.recommendation : "not_run",
    r25s_recommended_variant: r25rDecisionReport?.recommended_variant || r25sSamplingConfig?.variant_id || null,
    r25s_run_status: r25sRunOk ? "passed_data_first_bounded_pilot" : r25sRunReport?.small_pilot_training_ran ? "needs_review" : "not_run",
    r25s_variant: r25sRunReport?.variant_id || r25sApproval?.variant_id || r25sSamplingConfig?.variant_id || null,
    r25s_train_loss_decreased: r25sRunReport?.train_loss_decreased === true,
    r25s_dev_loss_finite: r25sRunReport?.dev_loss_finite === true,
    r25s_heldout_loss_status: r25sHeldoutOk ? "finite_replay_loss" : r25sHeldoutReport?.ok ? "needs_review" : "not_run",
    r25s_heldout_loss: Number.isFinite(Number(r25sHeldoutReport?.heldout_loss)) ? r25sHeldoutReport.heldout_loss : null,
    r25s_replayable_checkpoint_status: r25sEvalReport?.checkpoint_validates ? "valid_ignored_replayable_checkpoint" : r25sRunReport?.replayable_checkpoint_written ? "written_needs_validation" : "not_written",
    r25s_approval_consumed_status: r25sApproval?.consumed === true ? "consumed_one_shot_marker_inert" : r25sApproval?.approved ? "active_needs_consumption_after_run" : "not_present_or_not_approved",
    r25s_history_comparison_status: r25sHistoryReport?.ok ? r25sHistoryReport.status : "not_run",
    r25s_analysis_status: r25sAnalysisReport?.ok ? r25sAnalysisReport.classification : r25sAnalysisReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25s_overfit_risk: r25sAnalysisReport?.overfit_risk || "not_run",
    r25s_heldout_breakdown_status: r25sHeldoutBreakdownReport?.ok ? (r25sHeldoutBreakdownReport.skipped ? "skipped_ignored_artifacts_missing" : "breakdown_ready") : "not_run",
    r25t_generalization_comparison_status: r25tComparisonReport?.ok ? (r25tComparisonReport.data_first_helped ? "data_first_helped" : "needs_review") : r25tComparisonReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25t_recommendation: r25tDecisionReport?.ok ? r25tDecisionReport.recommendation : "not_run",
    r25u_approval_template_status: r25uApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    phase3_exit_criteria_status: phase3ExitCriteria?.phase4_approved === false ? "defined_phase4_not_approved" : "not_present_or_needs_review",
    phase4_readiness_status: phase4ReadinessReport?.ok ? (phase4ReadinessReport.ready ? "needs_review_unexpected_ready" : "not_ready_not_approved") : "not_run",
    architecture_ablation_plan_status: architectureAblationReport?.ok ? `planned_${architectureAblationReport.recommended_ablation || "none"}` : "not_run",
    r25u_recommendation: r25uPhaseDecisionReport?.ok ? r25uPhaseDecisionReport.recommended_next : "not_run",
    r25v_approval_template_status: r25vApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25v_run_status: r25vCompleteOk ? "passed_two_layer_architecture_ablation_pilot" : r25vBlockedOk ? "blocked_unsupported_backend_no_training" : r25vRunReport?.small_pilot_training_ran ? "needs_review" : "not_run",
    r25v_variant: r25vRunReport?.variant_id || r25vApproval?.variant_id || null,
    r25v_actual_layers: r25vRunReport?.actual_layers ?? null,
    r25v_architecture_ablation_training: r25vRunReport?.architecture_ablation_training === true,
    r25v_train_loss_decreased: r25vRunReport?.train_loss_decreased === true,
    r25v_dev_loss_finite: r25vRunReport?.dev_loss_finite === true,
    r25v_heldout_loss_status: r25vHeldoutOk ? "finite_replay_loss" : r25vBlockedOk ? "blocked_no_checkpoint" : r25vHeldoutReport?.ok ? "needs_review" : "not_run",
    r25v_heldout_loss: Number.isFinite(Number(r25vHeldoutReport?.heldout_loss)) ? r25vHeldoutReport.heldout_loss : null,
    r25v_replayable_checkpoint_status: r25vEvalReport?.checkpoint_validates ? "valid_ignored_replayable_checkpoint" : r25vRunReport?.replayable_checkpoint_written ? "written_needs_validation" : r25vBlockedOk ? "not_written_blocked" : "not_written",
    r25v_approval_consumed_status: r25vApproval?.consumed === true ? "consumed_one_shot_marker_inert" : r25vApproval?.approved ? "active_needs_consumption_after_attempt" : "not_present_or_not_approved",
    r25v_phase4_scaled_training: false,
    r25v_history_comparison_status: r25vHistoryReport?.ok ? r25vHistoryReport.status : "not_run",
    r25v_two_layer_ablation_helped: r25vHistoryReport?.two_layer_ablation_helped ?? null,
    r25v_analysis_status: r25vAnalysisReport?.ok ? r25vAnalysisReport.ablation_result || r25vAnalysisReport.classification : r25vAnalysisReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25v_overfit_risk: r25vAnalysisReport?.overfit_risk || "not_run",
    r25v_ablation_result: r25vAnalysisReport?.ablation_result || "not_run",
    r25v_heldout_breakdown_status: r25vHeldoutBreakdownReport?.ok ? (r25vHeldoutBreakdownReport.skipped ? "skipped_ignored_artifacts_missing" : "breakdown_ready") : "not_run",
    data_vs_architecture_decision: dataVsArchitectureReport?.ok ? {
      data_first_best_so_far: dataVsArchitectureReport.data_first_best_so_far,
      architecture_ablation_helped: dataVsArchitectureReport.architecture_ablation_helped,
      best_pilot: dataVsArchitectureReport.best_pilot,
      recommendation: dataVsArchitectureReport.recommendation
    } : "not_run",
    phase3_decision_status: phase3DecisionLedger?.phase4_scaled_training_approved === false ? phase3DecisionLedger.current_decision?.phase3_continue_or_pause || "defined_phase4_blocked" : "not_present_or_needs_review",
    r25w_recommendation: r25wDecisionReport?.ok ? r25wDecisionReport.recommendation : "not_run",
    r25x_approval_template_status: r25xApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25x_data_quality_audit_status: r25xDataQualityAudit?.ok ? (r25xDataQualityAudit.warnings?.length ? "passed_with_soft_warnings" : "passed_no_hard_violations") : r25xDataQualityAudit?.ok === false ? "hard_failures" : "not_run",
    r25x_best_pilot_rows_status: r25xBestPilotRows?.ok ? "r25s_best_rows_summarized" : r25xBestPilotRows?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25y_design_status: r25yDesignOk ? "data_regularization_design_validated_inert" : "not_present_or_needs_review",
    r25y_approval_template_status: r25yApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25x_recommendation: r25xPhase3ReviewReport?.ok ? r25xPhase3ReviewReport.recommendation : "not_run",
    r25s_sampling_counts: r25sSamplingPlan?.ok ? {
      train: r25sSamplingPlan.train_row_count,
      dev: r25sSamplingPlan.dev_row_count,
      heldout: r25sSamplingPlan.heldout_row_count,
      languages: r25sSamplingPlan.language_counts,
      task_types: r25sSamplingPlan.task_type_counts,
      families: r25sSamplingPlan.family_counts
    } : null,
    small_decoder_pilot_metrics: smallPilotRunReport?.small_pilot_training_ran ? {
      architecture_type: smallPilotRunReport.architecture_type,
      parameter_count: smallPilotRunReport.parameter_count,
      steps: smallPilotRunReport.steps,
      initial_train_loss: smallPilotRunReport.initial_train_loss,
      final_train_loss: smallPilotRunReport.final_train_loss,
      initial_dev_loss: smallPilotRunReport.initial_dev_loss,
      final_dev_loss: smallPilotRunReport.final_dev_loss
    } : null,
    small_decoder_pilot_parameter_estimate: smallPilotPlanReport?.parameter_estimate || null,
    small_decoder_pilot_capacity_profile_fit: smallPilotPlanReport?.capacity_profile_fit || null,
    completed_infrastructure: [
      ...present,
      ...(tokenizerDryrunOk ? ["artifacts/training_os/tokenizer_dryrun/r25j_tokenizer_report.json"] : []),
      ...(toyPipelineOk ? ["artifacts/training_os/tiny_decoder_toy/r25j_toy_overfit_skip_report.json"] : []),
      ...(toyOverfitOk ? ["artifacts/training_os/tiny_decoder_toy/r25k_toy_run_report.json"] : []),
      ...(r25lCorpusOk ? ["training/llm_corpus/r25l_train.jsonl", "training/llm_corpus/r25l_dev.jsonl", "training/llm_corpus/r25l_heldout.jsonl"] : []),
      ...(r25lTokenizerDryrunOk ? ["artifacts/training_os/tokenizer_dryrun/r25l/r25j_tokenizer_report.json"] : []),
      ...(smallPilotPlanOk ? ["artifacts/training_os/small_decoder_pilot/r25l_small_decoder_pilot_plan.json"] : []),
      ...(smallPilotRanOk ? ["artifacts/training_os/small_decoder_pilot/r25m/r25m_small_decoder_run_report.json"] : []),
      ...(approvalMarkersConsumedOk ? ["training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json", "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json"] : []),
      ...(smallPilotEvaluationOk ? ["artifacts/training_os/small_decoder_pilot/r25n/r25n_small_pilot_analysis.json", "artifacts/training_os/small_decoder_pilot/r25n/r25n_heldout_eval_report.json"] : []),
      ...(r25pApprovalTemplateSafe ? ["training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.template.json"] : []),
      ...(r25oDesignOk ? [
        "training/from_scratch/small_decoder_checkpoint.schema.json",
        "training/from_scratch/small_decoder_second_pilot_config.json",
        "artifacts/training_os/small_decoder_pilot/r25o/r25o_second_pilot_plan.json",
        "artifacts/training_os/small_decoder_pilot/r25o/r25o_checkpoint_schema_report.json",
        "artifacts/training_os/small_decoder_pilot/r25o/r25o_replay_heldout_eval_report.json",
        "artifacts/training_os/small_decoder_pilot/r25o/r25o_history_comparison.json"
      ] : []),
      ...(r25pCompleteOk ? [
        "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25p.json",
        "artifacts/training_os/small_decoder_pilot/r25p/r25p_small_decoder_run_report.json",
        "artifacts/training_os/small_decoder_pilot/r25p/r25p_replayable_checkpoint.json",
        "artifacts/training_os/small_decoder_pilot/r25p/r25p_heldout_eval_report.json"
      ] : []),
      ...(r25qAnalysisOk ? [
        "artifacts/training_os/small_decoder_pilot/r25q/r25q_pilot_analysis.json",
        "artifacts/training_os/small_decoder_pilot/r25q/r25q_replay_determinism_report.json",
        "artifacts/training_os/small_decoder_pilot/r25q/r25q_heldout_breakdown.json",
        "artifacts/training_os/small_decoder_pilot/r25q/r25q_history_comparison.json",
        "artifacts/training_os/small_decoder_pilot/r25q/r25q_next_step_decision.json",
        "training/from_scratch/APPROVE_R25R_NEXT_SMALL_PILOT.template.json"
      ] : []),
      ...(r25sDesignOk ? [
        "training/from_scratch/small_decoder_r25s_sampling_config.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25s.template.json",
        "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json",
        "artifacts/training_os/small_decoder_pilot/r25r/r25s_balanced_dataset_plan.json",
        "artifacts/training_os/small_decoder_pilot/r25r/r25r_decision_report.json"
      ] : []),
      ...(r25sCompleteOk ? [
        "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25s.json",
        "artifacts/training_os/small_decoder_pilot/r25s/r25s_small_decoder_run_report.json",
        "artifacts/training_os/small_decoder_pilot/r25s/r25s_replayable_checkpoint.json",
        "artifacts/training_os/small_decoder_pilot/r25s/r25s_heldout_eval_report.json"
      ] : []),
      ...(r25tAnalysisOk ? [
        "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_analysis.json",
        "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25s_heldout_breakdown.json",
        "artifacts/training_os/small_decoder_pilot/r25t/r25t_r25p_r25s_generalization.json",
        "artifacts/training_os/small_decoder_pilot/r25t/r25t_next_step_decision.json",
        "training/from_scratch/APPROVE_R25U_ARCHITECTURE_ABLATION.template.json"
      ] : []),
      ...(r25uPlanningOk ? [
        "training/from_scratch/phase3_exit_criteria.json",
        "training/from_scratch/architecture_ablation_plan.r25u.json",
        "training/from_scratch/APPROVE_R25V_NEXT_PILOT.template.json",
        "artifacts/training_os/small_decoder_pilot/r25u/r25u_phase4_readiness_report.json",
        "artifacts/training_os/small_decoder_pilot/r25u/r25u_architecture_ablation_plan.json",
        "artifacts/training_os/small_decoder_pilot/r25u/r25u_phase_decision_report.json"
      ] : []),
      ...(r25vCompleteOk ? [
        "training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25v.json",
        "artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json",
        "artifacts/training_os/small_decoder_pilot/r25v/r25v_replayable_checkpoint.json",
        "artifacts/training_os/small_decoder_pilot/r25v/r25v_heldout_eval_report.json"
      ] : r25vBlockedOk ? [
        "training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25v.json",
        "artifacts/training_os/small_decoder_pilot/r25v/r25v_small_decoder_run_report.json"
      ] : []),
      ...(r25wAnalysisOk ? [
        "training/from_scratch/phase3_decision_ledger.json",
        "training/from_scratch/APPROVE_R25X_FUTURE_PILOT.template.json",
        "artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_analysis.json",
        "artifacts/training_os/small_decoder_pilot/r25w/r25w_r25v_heldout_breakdown.json",
        "artifacts/training_os/small_decoder_pilot/r25w/r25w_data_vs_architecture_comparison.json",
        "artifacts/training_os/small_decoder_pilot/r25w/r25w_next_step_decision.json"
      ] : []),
      ...(r25xReviewOk ? [
        "training/from_scratch/phase3_review_ledger.r25x.json",
        "training/from_scratch/r25x_data_quality_audit_config.json",
        "training/from_scratch/small_decoder_r25y_data_regularization_config.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25y.template.json",
        "training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json",
        "artifacts/training_os/small_decoder_pilot/r25x/r25x_data_quality_audit.json",
        "artifacts/training_os/small_decoder_pilot/r25x/r25x_r25s_best_rows.json",
        "artifacts/training_os/small_decoder_pilot/r25x/r25x_phase3_review_report.json"
      ] : [])
    ],
    missing_before_training: [
      ...(r25lCorpusOk ? [] : ["reviewed expanded corpus with clean train/dev/heldout split"]),
      ...(tokenizerDryrunOk ? [] : ["tokenizer dry-run and held-out tokenizer evaluation"]),
      ...(toyOverfitOk ? [] : ["explicit phase_2 approval and passing toy-only overfit sanity"]),
      ...(r25lTokenizerDryrunOk ? [] : ["expanded-corpus tokenizer dry-run and eval"]),
      ...(smallPilotPlanOk ? [] : ["small decoder pilot architecture, budget, and capacity plan"]),
      ...(r25pCompleteOk
        ? [r25xReviewOk ? "review R25X and obtain fresh reviewer approval before any R25Y data-regularization pilot; phase_4 remains blocked" : r25wAnalysisOk ? "pause phase_3 for review or design data/regularization only after fresh approval; phase_4 remains blocked" : r25vCompleteOk || r25vBlockedOk ? "review R25V against R25S before any additional phase_3 pilot; phase_4 remains blocked" : r25uPlanningOk ? "fresh reviewer approval before any R25V phase_3 ablation or data follow-up; phase_4 remains blocked" : r25sCompleteOk ? "review R25S against R25P before any additional pilot, architecture ablation, or scaling" : r25sDesignOk ? "fresh reviewer approval before any R25S data-first bounded pilot" : r25qAnalysisOk ? "review R25Q before any R25R approval or architecture scaling" : "review R25P against R25M before any additional pilot or architecture scaling"]
        : smallPilotRanOk
          ? ["review R25M/R25N outputs before any second or larger run"]
          : ["future explicit phase_3 approval before any small decoder pilot training"]),
      "training hardware/runtime plan",
      "checkpoint provenance and release-decision validator",
      "R25E/R25H static release admission for a self-trained artifact"
    ],
    risk_register: [
      "overclaiming readiness before formal training begins",
      "accidentally treating external pretrained imports as product selection",
      "letting eval prompts or private data leak into training",
      "exceeding the Pro static profile after quantization",
      "weakening R24 gates to make training appear successful"
    ],
    lessons_learned: [
      "R24 is the safety harness, not the main intelligence layer",
      "R25 static gates are release packaging gates for future self-trained artifacts",
      "dry-run capacity manifests are planning artifacts, not admitted models"
    ],
    avoid_previous_errors: [
      "do not replace the browser LLM goal with SLM or tiny-router paths",
      "do not use LoRA or adapters as the final strategy",
      "do not confuse fixture first-token smoke with real model performance",
      "do not describe candidate admission as external model selection"
    ],
    r25k_boundaries: [
      "toy overfit sanity is not formal decoder training",
      "toy checkpoint is ignored and not a release candidate",
      "formal training progress remains 0%",
      "no product model exists"
    ],
    r25l_boundaries: [
      "expanded corpus and small decoder pilot planning are not formal training",
      "small decoder pilot run skips by default until future explicit approval",
      "pilot artifacts are ignored planning reports, not release weights",
      "browser product completion does not imply a model artifact exists"
    ],
    r25m_boundaries: [
      "R25M small decoder pilot is bounded and approval-gated",
      "R25M is not long-term training, product-scale training, or release admission",
      "R25M artifacts must remain ignored and untracked",
      "product training progress remains 0%"
    ],
    r25n_boundaries: [
      "R25N evaluates existing R25M outputs and does not run training",
      "R25K and R25M one-shot approval markers are consumed and inert",
      "future training requires a fresh reviewer approval marker",
      "held-out pilot evaluation is structural and not a product benchmark"
    ],
    r25o_boundaries: [
      "R25O designs the second bounded pilot and does not run training",
      "R25P approval template is approved:false and cannot authorize training",
      "R25M digest checkpoint is not replayable for true held-out loss",
      "future replayable checkpoints must stay ignored and are not release artifacts"
    ],
    r25p_boundaries: [
      "R25P runs exactly one approved second bounded pilot variant",
      "R25P is not product-scale training, long-term training, release admission, or a browser static artifact",
      "R25P replayable checkpoint is ignored and not commit-allowed",
      "future training requires a fresh reviewer approval marker"
    ],
    r25q_boundaries: [
      "R25Q analyzes R25P outputs and does not run training",
      "R25Q replay determinism and held-out breakdown are evaluation-only",
      "R25R template is approved:false and cannot authorize training",
      "phase_4 scaled training is not approved"
    ],
    r25r_boundaries: [
      "R25R designs R25S and does not run training",
      "R25S approval template is approved:false and cannot authorize training",
      "R25S should be data-first and balanced, not architecture scale",
      "product training progress remains 0% and pilot progress remains 2%"
    ],
    r25s_boundaries: [
      "R25S runs exactly one approved data-first bounded pilot variant",
      "R25S is not product-scale training, long-term training, phase_4 scaled training, release admission, or a browser static artifact",
      "R25S replayable checkpoint is ignored and not commit-allowed",
      "future training requires a fresh reviewer approval marker"
    ],
    r25t_boundaries: [
      "R25T analyzes R25S outputs and does not run training",
      "R25T compares R25S against R25P before any new pilot or architecture work",
      "R25U template is approved:false and cannot authorize training",
      "phase_4 scaled training remains not approved"
    ],
    r25u_boundaries: [
      "R25U defines phase_3 exit criteria and architecture ablation planning only",
      "R25V template is approved:false and cannot authorize training",
      "phase_4 scaled training remains not approved and requires future reviewer approval",
      "product training progress remains 0%"
    ],
    r25v_boundaries: [
      "R25V runs or safely blocks exactly one approved phase_3 architecture ablation attempt",
      "R25V is not product-scale training, long-term training, phase_4 scaled training, release admission, or a browser static artifact",
      "R25V replayable checkpoint, if written, is ignored and not commit-allowed",
      "future training requires a fresh reviewer approval marker"
    ],
    r25w_boundaries: [
      "R25W analyzes R25V outputs and does not run training",
      "R25W records the phase_3 decision ledger and keeps phase_4 blocked",
      "R25X template is approved:false and cannot authorize training",
      "product training progress remains 0% and pilot progress remains 4%"
    ],
    r25x_boundaries: [
      "R25X reviews phase_3 and does not run training",
      "R25Y data-regularization design is inert until fresh reviewer approval",
      "phase_4 scaled training remains not approved",
      "product training progress remains 0% and pilot progress remains 4%"
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
