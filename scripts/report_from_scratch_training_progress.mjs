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
  const r25yApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.json");
  const r25yRunConfig = await readJsonIfPresent("training/from_scratch/small_decoder_pilot_run_config.r25y.json");
  const r25yDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_dataset_report.json");
  const r25yRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_run_report.json");
  const r25yEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_eval_report.json");
  const r25yHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json");
  const r25yHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25y/r25y_history_comparison.json");
  const r25xPhase3ReviewReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25x/r25x_phase3_review_report.json");
  const r25yAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_analysis.json");
  const r25yHeldoutBreakdownReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_heldout_breakdown.json");
  const r25yDataRegularizationComparison = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_data_regularization_comparison.json");
  const r25zPhase3DecisionLedger = await readJsonIfPresent("training/from_scratch/phase3_decision_ledger.r25z.json");
  const r25zDecisionReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25z/r25z_next_step_decision.json");
  const r25aaApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AA_NEXT_STEP.template.json");
  const r25aaFinalReviewLedger = await readJsonIfPresent("training/from_scratch/phase3_final_review_ledger.r25aa.json");
  const r25aaPhase4ReadinessReview = await readJsonIfPresent("training/from_scratch/phase4_readiness_review.r25aa.json");
  const r25aaStaticEnvelope = await readJsonIfPresent("training/from_scratch/phase4_scaled_architecture_envelope.r25aa.json");
  const r25aaStaticEnvelopeReport = await readJsonIfPresent("artifacts/training_os/phase4_readiness/r25aa_static_envelope_report.json");
  const r25aaPhase3PauseReport = await readJsonIfPresent("artifacts/training_os/phase4_readiness/r25aa_phase3_pause_decision.json");
  const r25aaPhase4ReadinessCheck = await readJsonIfPresent("artifacts/training_os/phase4_readiness/r25aa_phase4_readiness_check_report.json");
  const r25abApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AB_PHASE4_READINESS.template.json");
  const r25abProjectMeaningDocPresent = await exists("docs/R25AB_PROJECT_MEANING.md");
  const r25abChineseFirstDocPresent = await exists("docs/R25AB_CHINESE_FIRST_TRAINING_DOCTRINE.md");
  const r25abPersonalBoundaryDocPresent = await exists("docs/R25AB_PERSONAL_COLOR_BOUNDARY.md");
  const r25abHealthyCycleDocPresent = await exists("docs/R25AB_HEALTHY_TRAINING_CYCLE.md");
  const r25abPersonalBoundary = await readJsonIfPresent("training/from_scratch/personal_color_boundary.r25ab.json");
  const r25abHealthyCycle = await readJsonIfPresent("training/from_scratch/healthy_training_cycle.r25ab.json");
  const r25acChinesePersonalConfig = await readJsonIfPresent("training/from_scratch/small_decoder_r25ac_chinese_personal_config.json");
  const r25acRunConfigTemplate = await readJsonIfPresent("training/from_scratch/small_decoder_pilot_run_config.r25ac.template.json");
  const r25acApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.template.json");
  const r25acApproval = await readJsonIfPresent("training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json");
  const r25acRunConfig = await readJsonIfPresent("training/from_scratch/small_decoder_pilot_run_config.r25ac.json");
  const r25acDatasetReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_dataset_report.json");
  const r25acRunReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json");
  const r25acEvalReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_eval_report.json");
  const r25acHeldoutReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_heldout_eval_report.json");
  const r25acBreakdownReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_chinese_personal_breakdown.json");
  const r25acHistoryReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ac/r25ac_history_comparison.json");
  const r25abCorpusAudit = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ab/r25ab_chinese_first_corpus_audit.json");
  const r25adAnalysisDocPresent = await exists("docs/R25AD_R25AC_ANALYSIS_AND_DECISION.md");
  const r25adCorpusGapDocPresent = await exists("docs/R25AD_CHINESE_PERSONAL_CORPUS_GAP.md");
  const r25aeDesignDocPresent = await exists("docs/R25AD_R25AE_CORPUS_EXPANSION_DESIGN.md");
  const r25adR25acAnalysisReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ac_analysis.json");
  const r25adPersonalTargetCoverageReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_personal_target_coverage.json");
  const r25adChineseCorpusGapReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_chinese_personal_corpus_gap.json");
  const r25adHistoryComparisonReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_small_pilot_history_comparison.json");
  const r25aeCorpusExpansionPlan = await readJsonIfPresent("training/from_scratch/chinese_personal_corpus_expansion_plan.r25ae.json");
  const r25aeApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json");
  const r25aeDesignCheckReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ae_corpus_expansion_design_check.json");
  const r25adNextStepReport = await readJsonIfPresent("artifacts/training_os/small_decoder_pilot/r25ad/r25ad_next_step_decision.json");
  const r25aeInventoryDocPresent = await exists("docs/R25AE_PERSONAL_DATA_INVENTORY.md");
  const r25aeInventoryPolicyDocPresent = await exists("docs/R25AE_PERSONAL_DATA_INVENTORY_POLICY.md");
  const r25aeInventorySummaryDocPresent = await exists("docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md");
  const r25aeCorpusSignalDocPresent = await exists("docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md");
  const r25aeLegacyScanDocPresent = await exists("docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md");
  const r25aeInventoryPolicy = await readJsonIfPresent("training/from_scratch/personal_data_inventory_policy.r25ae.json");
  const r25aeInventoryReport = await readJsonIfPresent("artifacts/training_os/personal_inventory/r25ae/personal_data_inventory.json");
  const r25aeCorpusSignalProfile = await readJsonIfPresent("artifacts/training_os/personal_inventory/r25ae/personal_corpus_signal_profile.json");
  const r25aeLegacyDiskScanAudit = await readJsonIfPresent("artifacts/training_os/personal_inventory/r25ae/legacy_disk_scan_footprint_audit.json");
  const r25aeBoundaryCheckReport = await readJsonIfPresent("artifacts/training_os/personal_inventory/r25ae/personal_data_inventory_boundary_check.json");
  const r25afIntakePolicyDocPresent = await exists("docs/R25AF_PERSONAL_WRITING_INTAKE_POLICY.md");
  const r25afTransformationDocPresent = await exists("docs/R25AF_WRITING_TO_DIALOGUE_TRANSFORMATION.md");
  const r25afR25agPathDocPresent = await exists("docs/R25AF_R25AG_CORPUS_EXPANSION_PATH.md");
  const r25afIntakePolicy = await readJsonIfPresent("training/from_scratch/personal_writing_intake_policy.r25af.json");
  const r25afSourceSchema = await readJsonIfPresent("training/from_scratch/personal_writing_source.schema.json");
  const r25afSourceManifestTemplate = await readJsonIfPresent("training/from_scratch/personal_writing_source_manifest.template.json");
  const r25afTransformationSchema = await readJsonIfPresent("training/from_scratch/personal_writing_transformation.schema.json");
  const r25agCorpusExpansionPlan = await readJsonIfPresent("training/from_scratch/chinese_personal_corpus_expansion_plan.r25ag.json");
  const r25agApprovalTemplate = await readJsonIfPresent("training/from_scratch/APPROVE_R25AG_DERIVED_CORPUS_EXPANSION.template.json");
  const r25afInboxAudit = await readJsonIfPresent("artifacts/training_os/personal_writing_intake/r25af/personal_writing_inbox_audit.json");
  const r25afReadinessReport = await readJsonIfPresent("artifacts/training_os/personal_writing_intake/r25af/personal_writing_transformation_readiness.json");
  const r25agRepoDiscoveryPolicyDocPresent = await exists("docs/R25AG_REPOSITORY_TEXT_DISCOVERY_POLICY.md");
  const r25agRepoDiscoveryDocPresent = await exists("docs/R25AG_REPOSITORY_TEXT_DISCOVERY.md");
  const r25agRepoTextSummaryDocPresent = await exists("docs/R25AG_REPOSITORY_TEXT_SOURCE_SUMMARY.md");
  const r25agSourceRankingDocPresent = await exists("docs/R25AG_PERSONAL_CORPUS_SOURCE_RANKING.md");
  const r25agExistingAnswerDocPresent = await exists("docs/R25AG_EXISTING_ANSWER_LIKE_TEXT_SUMMARY.md");
  const r25agLegacyScanDocPresent = await exists("docs/R25AG_LEGACY_SCAN_RECONCILIATION.md");
  const r25agRepoDiscoveryPolicy = await readJsonIfPresent("training/from_scratch/repository_text_discovery_policy.r25ag.json");
  const r25agRepoTextDiscoveryReport = await readJsonIfPresent("artifacts/training_os/repo_text_discovery/r25ag/repository_text_sources.json");
  const r25agPersonalSourceRankingReport = await readJsonIfPresent("artifacts/training_os/repo_text_discovery/r25ag/personal_corpus_source_ranking.json");
  const r25agExistingAnswerAuditReport = await readJsonIfPresent("artifacts/training_os/repo_text_discovery/r25ag/existing_answer_like_text_audit.json");
  const r25agLegacyScanReconciliationReport = await readJsonIfPresent("artifacts/training_os/repo_text_discovery/r25ag/legacy_scan_reconciliation.json");
  const r25agRepoDiscoveryBoundaryReport = await readJsonIfPresent("artifacts/training_os/repo_text_discovery/r25ag/repo_text_discovery_boundary_check.json");
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
    (!r25vApproval || (r25vApproval?.consumed === true && r25vApproval?.allow_additional_runs === false)) &&
    (!r25yApproval || (r25yApproval?.consumed === true && r25yApproval?.allow_additional_runs === false)) &&
    (!r25acApproval || (r25acApproval?.consumed === true && r25acApproval?.allow_additional_runs === false))
  );
  const activeTrainingApprovalCount = [
    r25kApproval?.approved && r25kApproval?.consumed !== true && r25kApproval?.scope === "toy_overfit_sanity_only",
    r25mApproval?.approved && r25mApproval?.consumed !== true && r25mApproval?.allow_small_pilot_training === true,
    r25pApproval?.approved && r25pApproval?.consumed !== true && r25pApproval?.allow_small_pilot_training === true,
    r25sApproval?.approved && r25sApproval?.consumed !== true && r25sApproval?.allow_small_pilot_training === true,
    r25vApproval?.approved && r25vApproval?.consumed !== true && (r25vApproval?.allow_small_pilot_training === true || r25vApproval?.allow_architecture_ablation_training === true || r25vApproval?.allow_phase_4_scaled_training === true),
    r25yApproval?.approved && r25yApproval?.consumed !== true && (r25yApproval?.allow_small_pilot_training === true || r25yApproval?.allow_data_regularization_training === true || r25yApproval?.allow_phase_4_scaled_training === true),
    r25acApproval?.approved && r25acApproval?.consumed !== true && (r25acApproval?.allow_small_pilot_training === true || r25acApproval?.allow_chinese_personal_microcycle === true || r25acApproval?.allow_phase_4_scaled_training === true),
    r25rApprovalTemplate?.approved && r25rApprovalTemplate?.allow_small_pilot_training === true,
    r25sApprovalTemplate?.approved && r25sApprovalTemplate?.allow_small_pilot_training === true,
    r25uApprovalTemplate?.approved && (r25uApprovalTemplate?.allow_small_pilot_training === true || r25uApprovalTemplate?.allow_architecture_ablation_training === true || r25uApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25vApprovalTemplate?.approved && (r25vApprovalTemplate?.allow_small_pilot_training === true || r25vApprovalTemplate?.allow_architecture_ablation_training === true || r25vApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25xApprovalTemplate?.approved && (r25xApprovalTemplate?.allow_small_pilot_training === true || r25xApprovalTemplate?.allow_data_refinement_training === true || r25xApprovalTemplate?.allow_architecture_ablation_training === true || r25xApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25yApprovalTemplate?.approved && (r25yApprovalTemplate?.allow_small_pilot_training === true || r25yApprovalTemplate?.allow_data_regularization_training === true || r25yApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25aaApprovalTemplate?.approved && (r25aaApprovalTemplate?.allow_small_pilot_training === true || r25aaApprovalTemplate?.allow_data_regularization_training === true || r25aaApprovalTemplate?.allow_architecture_ablation_training === true || r25aaApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25abApprovalTemplate?.approved && (r25abApprovalTemplate?.allow_phase4_design === true || r25abApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25acApprovalTemplate?.approved && (r25acApprovalTemplate?.allow_small_pilot_training === true || r25acApprovalTemplate?.allow_chinese_personal_microcycle === true || r25acApprovalTemplate?.allow_phase_4_scaled_training === true),
    r25aeApprovalTemplate?.approved && (r25aeApprovalTemplate?.allow_training === true || r25aeApprovalTemplate?.allow_small_pilot_training === true || r25aeApprovalTemplate?.allow_phase_4_scaled_training === true || r25aeApprovalTemplate?.allow_product_model_training === true || r25aeApprovalTemplate?.allow_long_term_training === true),
    r25agApprovalTemplate?.approved && (r25agApprovalTemplate?.allow_training === true || r25agApprovalTemplate?.allow_corpus_generation === true || r25agApprovalTemplate?.allow_source_parsing === true || r25agApprovalTemplate?.allow_phase_4_scaled_training === true)
  ].filter(Boolean).length;
  const activeProductTrainingApprovalCount = [
    r25kApproval?.consumed !== true && r25kApproval?.allow_product_model_training === true,
    r25mApproval?.consumed !== true && r25mApproval?.allow_product_model_training === true,
    r25pApproval?.consumed !== true && r25pApproval?.allow_product_model_training === true,
    r25sApproval?.consumed !== true && r25sApproval?.allow_product_model_training === true,
    r25vApproval?.consumed !== true && r25vApproval?.allow_product_model_training === true,
    r25yApproval?.consumed !== true && r25yApproval?.allow_product_model_training === true,
    r25acApproval?.consumed !== true && r25acApproval?.allow_product_model_training === true,
    r25rApprovalTemplate?.allow_product_model_training === true,
    r25sApprovalTemplate?.allow_product_model_training === true,
    r25uApprovalTemplate?.allow_product_model_training === true,
    r25vApprovalTemplate?.allow_product_model_training === true,
    r25xApprovalTemplate?.allow_product_model_training === true,
    r25yApprovalTemplate?.allow_product_model_training === true,
    r25aaApprovalTemplate?.allow_product_model_training === true,
    r25abApprovalTemplate?.allow_product_model_training === true,
    r25acApprovalTemplate?.allow_product_model_training === true,
    r25aeApprovalTemplate?.allow_product_model_training === true,
    r25agApprovalTemplate?.allow_product_model_training === true
  ].filter(Boolean).length;
  const activeWeightCommitApprovalCount = [
    r25kApproval?.consumed !== true && r25kApproval?.allow_weight_commit === true,
    r25mApproval?.consumed !== true && r25mApproval?.allow_weight_commit === true,
    r25pApproval?.consumed !== true && r25pApproval?.allow_weight_commit === true,
    r25sApproval?.consumed !== true && r25sApproval?.allow_weight_commit === true,
    r25vApproval?.consumed !== true && r25vApproval?.allow_weight_commit === true,
    r25yApproval?.consumed !== true && r25yApproval?.allow_weight_commit === true,
    r25acApproval?.consumed !== true && r25acApproval?.allow_weight_commit === true,
    r25rApprovalTemplate?.allow_weight_commit === true,
    r25sApprovalTemplate?.allow_weight_commit === true,
    r25uApprovalTemplate?.allow_weight_commit === true,
    r25vApprovalTemplate?.allow_weight_commit === true,
    r25xApprovalTemplate?.allow_weight_commit === true,
    r25yApprovalTemplate?.allow_weight_commit === true,
    r25aaApprovalTemplate?.allow_weight_commit === true,
    r25abApprovalTemplate?.allow_weight_commit === true,
    r25acApprovalTemplate?.allow_weight_commit === true,
    r25aeApprovalTemplate?.allow_weight_commit === true,
    r25agApprovalTemplate?.allow_weight_commit === true
  ].filter(Boolean).length;
  const activePhase4TrainingApprovalCount = [
    r25vApproval?.consumed !== true && r25vApproval?.allow_phase_4_scaled_training === true,
    r25yApproval?.consumed !== true && r25yApproval?.allow_phase_4_scaled_training === true,
    r25acApproval?.consumed !== true && r25acApproval?.allow_phase_4_scaled_training === true,
    r25uApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25vApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25xApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25yApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25aaApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25abApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25acApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25aeApprovalTemplate?.allow_phase_4_scaled_training === true,
    r25agApprovalTemplate?.allow_phase_4_scaled_training === true
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
  const r25yRunOk = Boolean(
    r25yDatasetReport?.ok &&
    r25yRunReport?.ok &&
    r25yRunReport?.run_id === "r25y_data_regularized_192" &&
    r25yRunReport?.variant_id === "r25y_data_regularized_192" &&
    r25yRunReport?.small_pilot_training_ran === true &&
    r25yRunReport?.data_regularization_training === true &&
    Number(r25yRunReport?.actual_layers) === 1 &&
    r25yRunReport?.formal_product_training === false &&
    r25yRunReport?.long_term_training === false &&
    r25yRunReport?.phase_4_scaled_training === false &&
    r25yRunReport?.product_model === false &&
    r25yRunReport?.release_checkpoint === false &&
    r25yRunReport?.train_loss_decreased === true &&
    r25yRunReport?.dev_loss_finite === true &&
    r25yRunReport?.replayable_checkpoint_written === true &&
    r25yEvalReport?.ok
  );
  const r25yHeldoutOk = Boolean(
    r25yHeldoutReport?.ok &&
    r25yHeldoutReport?.heldout_loss_finite === true &&
    r25yHeldoutReport?.train_dev_heldout_overlap === false
  );
  const r25yDataRegularizationHelped = Boolean(
    r25yHistoryReport?.data_regularization_helped === true ||
    r25yHistoryReport?.recommendation_category === "data_regularization_helped_review_next"
  );
  const r25yCompleteOk = Boolean(
    r25yRunOk &&
    r25yHeldoutOk &&
    r25yApproval?.consumed === true &&
    activeTrainingApprovalCount === 0 &&
    activeProductTrainingApprovalCount === 0 &&
    activeWeightCommitApprovalCount === 0
  );
  const r25aaApprovalTemplateSafe = Boolean(
    r25aaApprovalTemplate?.approved === false &&
    r25aaApprovalTemplate?.allow_small_pilot_training === false &&
    r25aaApprovalTemplate?.allow_data_regularization_training === false &&
    r25aaApprovalTemplate?.allow_architecture_ablation_training === false &&
    r25aaApprovalTemplate?.allow_product_model_training === false &&
    r25aaApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25aaApprovalTemplate?.allow_weight_commit === false
  );
  const r25abApprovalTemplateSafe = Boolean(
    r25abApprovalTemplate?.approved === false &&
    r25abApprovalTemplate?.allow_phase4_design === false &&
    r25abApprovalTemplate?.allow_product_model_training === false &&
    r25abApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25abApprovalTemplate?.allow_weight_commit === false
  );
  const r25acApprovalTemplateSafe = Boolean(
    r25acApprovalTemplate?.approved === false &&
    r25acApprovalTemplate?.allow_small_pilot_training === false &&
    r25acApprovalTemplate?.allow_chinese_personal_microcycle === false &&
    r25acApprovalTemplate?.allow_product_model_training === false &&
    r25acApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25acApprovalTemplate?.allow_weight_commit === false
  );
  const r25abProjectMeaningOk = Boolean(r25abProjectMeaningDocPresent);
  const r25abChineseFirstOk = Boolean(
    r25abChineseFirstDocPresent &&
    Number(r25acChinesePersonalConfig?.language_mix_target?.zh_min) >= 0.7 &&
    Number(r25acChinesePersonalConfig?.language_mix_target?.en_max) <= 0.1
  );
  const r25abPersonalBoundaryOk = Boolean(
    r25abPersonalBoundaryDocPresent &&
    r25abPersonalBoundary?.private_raw_data_allowed === false &&
    r25abPersonalBoundary?.chain_of_thought_allowed === false &&
    r25abPersonalBoundary?.root_pdf_docx_active_source === false &&
    r25abPersonalBoundary?.data_public_ingestion_active_source === false
  );
  const r25abHealthyCycleOk = Boolean(
    r25abHealthyCycleDocPresent &&
    r25abHealthyCycle?.training_ran_in_r25ab === false &&
    r25abHealthyCycle?.rules?.continuous_unbounded_training_allowed === false &&
    r25abHealthyCycle?.rules?.repeated_run_from_same_approval_allowed === false &&
    r25abHealthyCycle?.phase_4_scaled_training_approved === false
  );
  const r25acDesignOk = Boolean(
    r25acChinesePersonalConfig?.training_allowed_by_default === false &&
    r25acChinesePersonalConfig?.requires_fresh_approval === true &&
    r25acChinesePersonalConfig?.product_model === false &&
    r25acChinesePersonalConfig?.release_checkpoint === false &&
    r25acChinesePersonalConfig?.phase_4_scaled_training === false &&
    r25acChinesePersonalConfig?.commit_weights_allowed === false &&
    r25acChinesePersonalConfig?.basis_pilot === "r25s_data_first_balanced_192" &&
    Number(r25acChinesePersonalConfig?.architecture?.layers) === 1 &&
    r25acRunConfigTemplate?.training_allowed_by_default === false &&
    r25acRunConfigTemplate?.approval_required === true &&
    r25acRunConfigTemplate?.phase_4_scaled_training === false &&
    r25acApprovalTemplateSafe
  );
  const r25acRunOk = Boolean(
    r25acDatasetReport?.ok &&
    r25acRunReport?.ok &&
    r25acRunReport?.run_id === "r25ac_chinese_personal_microcycle_256" &&
    r25acRunReport?.variant_id === "r25ac_chinese_personal_microcycle_256" &&
    r25acRunReport?.small_pilot_training_ran === true &&
    r25acRunReport?.chinese_personal_microcycle === true &&
    Number(r25acRunReport?.actual_layers) === 1 &&
    r25acRunReport?.formal_product_training === false &&
    r25acRunReport?.long_term_training === false &&
    r25acRunReport?.phase_4_scaled_training === false &&
    r25acRunReport?.product_model === false &&
    r25acRunReport?.release_checkpoint === false &&
    r25acRunReport?.train_loss_decreased === true &&
    r25acRunReport?.dev_loss_finite === true &&
    r25acRunReport?.replayable_checkpoint_written === true &&
    r25acEvalReport?.ok
  );
  const r25acHeldoutOk = Boolean(
    r25acHeldoutReport?.ok &&
    r25acHeldoutReport?.heldout_loss_finite === true &&
    r25acHeldoutReport?.train_dev_heldout_overlap === false
  );
  const r25acLanguageMixOk = Boolean(
    Number((r25acRunReport?.actual_language_mix || r25acDatasetReport?.actual_train_language_mix || {})?.zh || 0) >= 0.7 &&
    Number((r25acRunReport?.actual_language_mix || r25acDatasetReport?.actual_train_language_mix || {})?.en || 0) <= 0.1
  );
  const r25acPersonalCoverageOk = Boolean(
    r25acRunConfig?.personal_color_targets?.every((target) => {
      const coverage = r25acRunReport?.personal_target_coverage || r25acDatasetReport?.personal_target_coverage || {};
      return Number(coverage[target]?.rows || 0) > 0 && coverage[target]?.fabricated === false;
    })
  );
  const r25acCompleteOk = Boolean(
    r25acRunOk &&
    r25acHeldoutOk &&
    r25acBreakdownReport?.ok &&
    r25acLanguageMixOk &&
    r25acPersonalCoverageOk &&
    r25acApproval?.consumed === true &&
    r25acApproval?.allow_additional_runs === false &&
    activeTrainingApprovalCount === 0 &&
    activeProductTrainingApprovalCount === 0 &&
    activeWeightCommitApprovalCount === 0
  );
  const r25aeApprovalTemplateSafe = Boolean(
    r25aeApprovalTemplate?.approved === false &&
    r25aeApprovalTemplate?.allow_corpus_generation === false &&
    r25aeApprovalTemplate?.allow_training === false &&
    r25aeApprovalTemplate?.allow_small_pilot_training === false &&
    r25aeApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25aeApprovalTemplate?.allow_long_term_training === false &&
    r25aeApprovalTemplate?.allow_product_model_training === false &&
    r25aeApprovalTemplate?.allow_external_llm_generation === false &&
    r25aeApprovalTemplate?.allow_private_data_sources === false &&
    r25aeApprovalTemplate?.allow_release_checkpoint === false &&
    r25aeApprovalTemplate?.allow_weight_commit === false
  );
  const r25adR25acAnalysisOk = Boolean(
    r25adAnalysisDocPresent &&
    r25adR25acAnalysisReport?.ok &&
    r25adR25acAnalysisReport?.training_ran === false &&
    r25adR25acAnalysisReport?.classification === "language_mix_success_quality_regressed_vs_r25s" &&
    r25adR25acAnalysisReport?.quality_regressed_vs_r25s === true &&
    r25adR25acAnalysisReport?.phase_4_scaled_training_approved === false
  );
  const r25adPersonalTargetCoverageOk = Boolean(
    r25adPersonalTargetCoverageReport?.ok &&
    r25adPersonalTargetCoverageReport?.training_ran === false &&
    r25adPersonalTargetCoverageReport?.corpus_generated === false &&
    r25adPersonalTargetCoverageReport?.r25ac_actual_personal_target_coverage_complete === true
  );
  const r25adChineseCorpusGapOk = Boolean(
    r25adCorpusGapDocPresent &&
    r25adChineseCorpusGapReport?.ok &&
    r25adChineseCorpusGapReport?.training_ran === false &&
    r25adChineseCorpusGapReport?.corpus_generated === false &&
    r25adChineseCorpusGapReport?.current_r25l_insufficient_for_chinese_personal_target === true &&
    r25adChineseCorpusGapReport?.recommendation === "r25ae_expand_reviewed_chinese_personal_corpus_before_any_new_microcycle"
  );
  const r25aeDesignOk = Boolean(
    r25aeDesignDocPresent &&
    r25aeCorpusExpansionPlan?.status === "future_design_only_not_approved" &&
    r25aeCorpusExpansionPlan?.training_allowed === false &&
    r25aeCorpusExpansionPlan?.corpus_generation_allowed_in_r25ad === false &&
    r25aeCorpusExpansionPlan?.requires_fresh_approval_for_r25ae === true &&
    r25aeCorpusExpansionPlan?.phase_4_scaled_training_approved === false &&
    r25aeCorpusExpansionPlan?.commit_weights_allowed === false &&
    r25aeApprovalTemplateSafe &&
    r25aeDesignCheckReport?.ok === true
  );
  const r25adReviewOk = Boolean(
    r25acCompleteOk &&
    r25adR25acAnalysisOk &&
    r25adPersonalTargetCoverageOk &&
    r25adChineseCorpusGapOk &&
    r25adHistoryComparisonReport?.ok &&
    r25adHistoryComparisonReport?.chinese_personal_review === true &&
    r25adHistoryComparisonReport?.training_ran === false &&
    r25aeDesignOk &&
    r25adNextStepReport?.ok &&
    r25adNextStepReport?.recommendation === "r25ae_chinese_personal_corpus_expansion_review_before_any_new_microcycle" &&
    r25adNextStepReport?.phase_4_scaled_training_approved === false &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25aePersonalInventoryOk = Boolean(
    r25aeInventoryDocPresent &&
    r25aeInventoryPolicyDocPresent &&
    r25aeInventorySummaryDocPresent &&
    r25aeInventoryPolicy?.status === "audit_only_no_training_no_ingestion" &&
    r25aeInventoryPolicy?.repo_root_only === true &&
    r25aeInventoryPolicy?.training_allowed === false &&
    r25aeInventoryPolicy?.corpus_expansion_allowed === false &&
    r25aeInventoryPolicy?.phase_4_scaled_training_approved === false &&
    r25aeInventoryReport?.ok === true &&
    r25aeInventoryReport?.repo_root_only === true &&
    r25aeInventoryReport?.scan_outside_repo === false &&
    r25aeInventoryReport?.training_ran === false &&
    r25aeInventoryReport?.corpus_generated === false &&
    r25aeInventoryReport?.root_pdf_docx_content_parsed === false &&
    r25aeInventoryReport?.data_public_ingestion_content_parsed === false &&
    r25aeInventoryReport?.private_raw_data_ingested === false
  );
  const r25aeCorpusSignalOk = Boolean(
    r25aeCorpusSignalDocPresent &&
    r25aeCorpusSignalProfile?.ok === true &&
    r25aeCorpusSignalProfile?.training_ran === false &&
    r25aeCorpusSignalProfile?.corpus_generated === false &&
    r25aeCorpusSignalProfile?.raw_text_copied_to_tracked_docs === false
  );
  const r25aeLegacyDiskScanOk = Boolean(
    r25aeLegacyScanDocPresent &&
    r25aeLegacyDiskScanAudit?.ok === true &&
    r25aeLegacyDiskScanAudit?.repo_root_only === true &&
    r25aeLegacyDiskScanAudit?.scan_outside_repo === false &&
    r25aeLegacyDiskScanAudit?.training_ran === false &&
    r25aeLegacyDiskScanAudit?.corpus_generated === false &&
    r25aeLegacyDiskScanAudit?.root_pdf_docx_content_parsed === false &&
    r25aeLegacyDiskScanAudit?.data_public_ingestion_content_parsed === false
  );
  const r25aeBoundaryCheckOk = Boolean(
    r25aeBoundaryCheckReport?.ok === true &&
    r25aeBoundaryCheckReport?.root_pdf_docx_metadata_only === true &&
    r25aeBoundaryCheckReport?.data_public_ingestion_metadata_only === true &&
    r25aeBoundaryCheckReport?.no_generated_inventory_artifacts_staged === true &&
    r25aeBoundaryCheckReport?.active_training_approval_count === 0 &&
    r25aeBoundaryCheckReport?.active_phase4_training_approval_count === 0 &&
    r25aeBoundaryCheckReport?.phase_4_scaled_training_approved === false
  );
  const r25aeInventoryAuditOk = Boolean(
    r25adReviewOk &&
    r25aePersonalInventoryOk &&
    r25aeCorpusSignalOk &&
    r25aeLegacyDiskScanOk &&
    r25aeBoundaryCheckOk &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25aeEstimatedPersonalSignalLevel =
    r25aeCorpusSignalProfile?.current_training_corpus_assessment?.estimated_personal_training_signal_level || "unknown";
  const r25agApprovalTemplateSafe = Boolean(
    r25agApprovalTemplate?.approved === false &&
    r25agApprovalTemplate?.allow_source_parsing === false &&
    r25agApprovalTemplate?.allow_corpus_generation === false &&
    r25agApprovalTemplate?.allow_training === false &&
    r25agApprovalTemplate?.allow_external_llm_generation === false &&
    r25agApprovalTemplate?.allow_private_raw_commit === false &&
    r25agApprovalTemplate?.allow_phase_4_scaled_training === false &&
    r25agApprovalTemplate?.allow_weight_commit === false
  );
  const r25afPersonalWritingIntakeOk = Boolean(
    r25afIntakePolicyDocPresent &&
    r25afIntakePolicy?.status === "design_only_no_training_no_corpus_generation" &&
    r25afIntakePolicy?.repo_root_only === true &&
    r25afIntakePolicy?.training_allowed === false &&
    r25afIntakePolicy?.corpus_generation_allowed === false &&
    r25afIntakePolicy?.source_parsing_allowed_by_default === false &&
    r25afIntakePolicy?.commit_private_raw_writing_allowed === false &&
    r25afInboxAudit?.ok === true &&
    r25afInboxAudit?.repo_root_only === true &&
    r25afInboxAudit?.scan_outside_repo === false &&
    r25afInboxAudit?.raw_file_content_parsed === false &&
    r25afInboxAudit?.training_ran === false &&
    r25afInboxAudit?.corpus_generated === false &&
    r25afInboxAudit?.root_pdf_docx_content_parsed === false &&
    r25afInboxAudit?.data_public_ingestion_content_parsed === false
  );
  const r25afTransformationReadinessOk = Boolean(
    r25afTransformationDocPresent &&
    r25afSourceSchema &&
    r25afSourceManifestTemplate?.parse_approved === false &&
    r25afSourceManifestTemplate?.commit_raw_source_allowed === false &&
    r25afTransformationSchema &&
    r25afReadinessReport?.ok === true &&
    r25afReadinessReport?.private_sources_ignored === true &&
    r25afReadinessReport?.raw_source_file_staged === false &&
    r25afReadinessReport?.raw_source_content_tracked === false &&
    r25afReadinessReport?.raw_file_content_parsed === false &&
    r25afReadinessReport?.training_ran === false &&
    r25afReadinessReport?.corpus_generated === false &&
    r25afReadinessReport?.external_api_used === false &&
    r25afReadinessReport?.active_training_approval_count === 0
  );
  const r25agDesignOk = Boolean(
    r25afR25agPathDocPresent &&
    r25agCorpusExpansionPlan?.status === "future_design_only_not_approved" &&
    r25agCorpusExpansionPlan?.r25af_training_allowed === false &&
    r25agCorpusExpansionPlan?.r25af_corpus_generation_allowed === false &&
    r25agCorpusExpansionPlan?.requires_fresh_approval_for_r25ag === true &&
    r25agCorpusExpansionPlan?.source_parsing_allowed_by_default === false &&
    r25agCorpusExpansionPlan?.raw_private_source_commit_allowed === false &&
    r25agCorpusExpansionPlan?.training_allowed === false &&
    r25agCorpusExpansionPlan?.phase_4_scaled_training_approved === false &&
    r25agCorpusExpansionPlan?.external_llm_generation_allowed === false &&
    Number(r25agCorpusExpansionPlan?.target_language_mix?.zh_min) >= 0.7 &&
    Number(r25agCorpusExpansionPlan?.target_language_mix?.en_max) <= 0.1 &&
    r25agCorpusExpansionPlan?.r25ag_not_approved_in_r25af === true &&
    r25agApprovalTemplateSafe
  );
  const r25afIntakeDesignOk = Boolean(
    r25aeInventoryAuditOk &&
    r25afPersonalWritingIntakeOk &&
    r25afTransformationReadinessOk &&
    r25agDesignOk &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25agRepoDiscoveryPolicyOk = Boolean(
    r25agRepoDiscoveryPolicyDocPresent &&
    r25agRepoDiscoveryPolicy?.scope?.repo_root_only === true &&
    r25agRepoDiscoveryPolicy?.scope?.training === false &&
    r25agRepoDiscoveryPolicy?.scope?.corpus_row_generation === false &&
    r25agRepoDiscoveryPolicy?.scope?.training_corpus_modification === false &&
    r25agRepoDiscoveryPolicy?.forbidden?.root_pdf_docx_parsing === true &&
    r25agRepoDiscoveryPolicy?.forbidden?.data_public_ingestion_bulk_parsing === true &&
    r25agRepoDiscoveryPolicy?.status?.phase_4_scaled_training_approved === false
  );
  const r25agRepoTextDiscoveryOk = Boolean(
    r25agRepoDiscoveryDocPresent &&
    r25agRepoTextSummaryDocPresent &&
    r25agRepoTextDiscoveryReport?.ok === true &&
    r25agRepoTextDiscoveryReport?.safety?.repo_root_only === true &&
    r25agRepoTextDiscoveryReport?.safety?.scan_outside_repo === false &&
    r25agRepoTextDiscoveryReport?.safety?.training_ran === false &&
    r25agRepoTextDiscoveryReport?.safety?.corpus_rows_generated === false &&
    r25agRepoTextDiscoveryReport?.safety?.training_llm_corpus_modified === false &&
    r25agRepoTextDiscoveryReport?.safety?.root_pdf_docx_content_parsed === false &&
    r25agRepoTextDiscoveryReport?.safety?.data_public_ingestion_content_parsed === false &&
    r25agRepoTextDiscoveryReport?.safety?.external_api_used === false
  );
  const r25agPersonalSourceRankingOk = Boolean(
    r25agSourceRankingDocPresent &&
    r25agPersonalSourceRankingReport?.ok === true &&
    r25agPersonalSourceRankingReport?.safety?.training_ran === false &&
    r25agPersonalSourceRankingReport?.safety?.corpus_rows_generated === false &&
    r25agPersonalSourceRankingReport?.safety?.training_llm_corpus_modified === false &&
    r25agPersonalSourceRankingReport?.safety?.root_pdf_docx_content_parsed === false &&
    r25agPersonalSourceRankingReport?.safety?.data_public_ingestion_content_parsed === false &&
    r25agPersonalSourceRankingReport?.safety?.external_api_used === false
  );
  const r25agExistingAnswerAuditOk = Boolean(
    r25agExistingAnswerDocPresent &&
    r25agExistingAnswerAuditReport?.ok === true &&
    r25agExistingAnswerAuditReport?.safety?.training_ran === false &&
    r25agExistingAnswerAuditReport?.safety?.corpus_rows_generated === false &&
    r25agExistingAnswerAuditReport?.safety?.training_llm_corpus_modified === false &&
    r25agExistingAnswerAuditReport?.safety?.raw_private_text_copied === false
  );
  const r25agLegacyScanReconciliationOk = Boolean(
    r25agLegacyScanDocPresent &&
    r25agLegacyScanReconciliationReport?.ok === true &&
    r25agLegacyScanReconciliationReport?.safety?.repo_root_only === true &&
    r25agLegacyScanReconciliationReport?.safety?.scan_outside_repo === false &&
    r25agLegacyScanReconciliationReport?.safety?.root_pdf_docx_content_parsed === false &&
    r25agLegacyScanReconciliationReport?.safety?.data_public_ingestion_content_parsed === false &&
    r25agLegacyScanReconciliationReport?.safety?.training_ran === false &&
    r25agLegacyScanReconciliationReport?.safety?.corpus_rows_generated === false
  );
  const r25agRepoDiscoveryBoundaryOk = Boolean(
    r25agRepoDiscoveryBoundaryReport?.ok === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.no_generated_reports_staged === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.no_root_pdf_docx_staged === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.no_data_public_ingestion_staged === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.no_training_llm_corpus_modifications === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.no_derived_corpus_rows_generated === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.root_pdf_docx_metadata_only === true &&
    r25agRepoDiscoveryBoundaryReport?.checks?.data_public_ingestion_metadata_only === true &&
    r25agRepoDiscoveryBoundaryReport?.active_training_approval_count === 0 &&
    r25agRepoDiscoveryBoundaryReport?.active_phase4_training_approval_count === 0
  );
  const r25agRepoTextDiscoveryOkAll = Boolean(
    r25afIntakeDesignOk &&
    r25agRepoDiscoveryPolicyOk &&
    r25agRepoTextDiscoveryOk &&
    r25agPersonalSourceRankingOk &&
    r25agExistingAnswerAuditOk &&
    r25agLegacyScanReconciliationOk &&
    r25agRepoDiscoveryBoundaryOk &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25agEstimatedExistingPersonalSignalLevel =
    r25agPersonalSourceRankingReport?.summary?.estimated_existing_personal_signal_level || "unknown";
  const r25abDirectionDesignOk = Boolean(
    r25abProjectMeaningOk &&
    r25abChineseFirstOk &&
    r25abPersonalBoundaryOk &&
    r25abHealthyCycleOk &&
    r25acDesignOk &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25zAnalysisOk = Boolean(
    r25yCompleteOk &&
    r25yAnalysisReport?.ok &&
    r25yAnalysisReport?.regularization_result !== "invalid" &&
    r25yHeldoutBreakdownReport?.ok &&
    r25yDataRegularizationComparison?.ok &&
    r25yDataRegularizationComparison?.phase4_approved === false &&
    r25zPhase3DecisionLedger?.phase4_scaled_training_approved === false &&
    r25zPhase3DecisionLedger?.next_training_requires_fresh_approval === true &&
    r25zDecisionReport?.ok &&
    r25zDecisionReport?.phase4_approved === false &&
    r25aaApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0
  );
  const r25aaReviewOk = Boolean(
    r25zAnalysisOk &&
    r25aaFinalReviewLedger?.phase4_scaled_training_approved === false &&
    r25aaFinalReviewLedger?.phase3_status === "pause_for_review" &&
    r25aaFinalReviewLedger?.best_pilot === "r25s_data_first_balanced_192" &&
    r25aaPhase4ReadinessReview?.phase4_scaled_training_approved === false &&
    (r25aaPhase4ReadinessReview?.phase4_ready === false || r25aaPhase4ReadinessReview?.phase4_ready === "review_required") &&
    r25aaStaticEnvelope?.phase4_scaled_training_approved === false &&
    r25aaStaticEnvelope?.architecture_selected === false &&
    r25aaStaticEnvelopeReport?.ok === true &&
    r25aaStaticEnvelopeReport?.phase4_approved === false &&
    r25aaPhase3PauseReport?.ok === true &&
    r25aaPhase3PauseReport?.phase4_approved === false &&
    r25aaPhase4ReadinessCheck?.ok === true &&
    r25aaPhase4ReadinessCheck?.phase4_approved === false &&
    r25abApprovalTemplateSafe &&
    activeTrainingApprovalCount === 0 &&
    activePhase4TrainingApprovalCount === 0
  );
  const r25abDirectionOk = Boolean(r25aaReviewOk && r25abDirectionDesignOk);

  const report = {
    ok: missing.length === 0,
    training_started: false,
    pilot_training_started: r25acCompleteOk || r25yCompleteOk || r25vCompleteOk || r25sCompleteOk || r25pCompleteOk || smallPilotRanOk,
    formal_decoder_training_started: false,
    product_model_exists: false,
    formal_training_progress_percent: 0,
    product_training_progress_percent: 0,
    pilot_training_progress_percent: r25acCompleteOk ? 6 : r25yCompleteOk ? 5 : r25vCompleteOk ? 4 : r25sCompleteOk ? 3 : r25pCompleteOk ? 2 : smallPilotRanOk ? 1 : 0,
    from_scratch_program_progress_percent: r25agRepoTextDiscoveryOkAll ? 14 : r25afIntakeDesignOk ? 13 : r25aeInventoryAuditOk ? 12 : r25adReviewOk ? 11 : r25acCompleteOk ? 10 : r25abDirectionOk ? 9 : r25aaReviewOk ? 8 : r25zAnalysisOk ? 8 : r25yCompleteOk ? 7 : r25vCompleteOk ? 6 : r25sCompleteOk ? 5 : r25pCompleteOk ? 4 : smallPilotRanOk ? 3 : r25lReadyForReview ? 2 : toyOverfitOk ? 1 : 0,
    training_readiness_percent_estimate: r25agRepoTextDiscoveryOkAll ? 80 : r25afIntakeDesignOk ? 79 : r25aeInventoryAuditOk ? 78 : r25adReviewOk ? 77 : r25acCompleteOk ? 76 : r25abDirectionOk ? 75 : r25aaReviewOk ? 74 : r25zAnalysisOk ? 73 : r25yCompleteOk && r25yDataRegularizationHelped ? 74 : r25xReviewOk ? 73 : r25wAnalysisOk ? 72 : r25vCompleteOk ? 72 : r25vBlockedOk ? 70 : r25uPlanningOk ? 70 : r25tAnalysisOk ? 69 : r25sCompleteOk ? 68 : r25sDesignOk ? 67 : r25qAnalysisOk ? 66 : r25pCompleteOk ? 65 : r25oDesignOk ? 63 : smallPilotEvaluationOk ? 62 : smallPilotRanOk ? 60 : r25lReadyForReview ? 55 : toyOverfitOk ? 50 : tokenizerDryrunOk && toyPipelineOk ? 45 : 40,
    browser_product_completion_estimate: r25agRepoTextDiscoveryOkAll ? 33 : r25afIntakeDesignOk ? 33 : r25aeInventoryAuditOk ? 33 : r25acCompleteOk ? 33 : r25aaReviewOk ? 32 : r25zAnalysisOk ? 32 : r25yCompleteOk && r25yDataRegularizationHelped ? 33 : r25vCompleteOk ? 32 : r25vBlockedOk ? 31 : r25uPlanningOk ? 31 : r25tAnalysisOk ? 31 : r25sCompleteOk ? 31 : r25pCompleteOk ? 30 : smallPilotRanOk ? 29 : r25lReadyForReview ? 28 : toyOverfitOk ? 27 : tokenizerDryrunOk && toyPipelineOk ? 26 : 25,
    current_phase: r25agRepoTextDiscoveryOkAll ? "phase_3_repo_text_discovery_audited_pause" : r25afIntakeDesignOk ? "phase_3_personal_writing_intake_design_pause" : r25aeInventoryAuditOk ? "phase_3_personal_data_inventory_audited_pause" : r25adReviewOk ? "phase_3_chinese_personal_microcycle_analyzed_corpus_expansion_design_pause" : r25acCompleteOk ? "phase_3_chinese_personal_microcycle_completed_review_pause" : r25abDirectionOk ? "phase_3_chinese_personal_cycle_aligned_review_only" : r25aaReviewOk ? "phase_3_paused_phase4_readiness_review_only" : r25zAnalysisOk ? "phase_3_data_regularization_pilot_analyzed" : r25yCompleteOk ? "phase_3_data_regularization_pilot_completed" : r25xReviewOk ? "phase_3_review_and_data_regularization_designed" : r25wAnalysisOk ? "phase_3_architecture_ablation_analyzed" : r25vCompleteOk ? "phase_3_architecture_ablation_pilot_completed" : r25vBlockedOk ? "phase_3_architecture_ablation_pilot_blocked" : r25uPlanningOk ? "phase_3_exit_criteria_and_ablation_planned" : r25tAnalysisOk ? "phase_3_data_first_pilot_analyzed" : r25sCompleteOk ? "phase_3_data_first_third_pilot_completed" : r25sDesignOk ? "phase_3_data_first_third_pilot_designed" : r25qAnalysisOk ? "phase_3_second_small_pilot_analyzed" : r25pCompleteOk ? "phase_3_second_small_pilot_completed" : r25oDesignOk ? "phase_3_second_small_pilot_designed" : smallPilotEvaluationOk ? "phase_3_small_decoder_pilot_evaluated" : smallPilotRanOk ? "phase_3_small_decoder_pilot" : r25lReadyForReview ? "phase_3_small_decoder_pilot_planned" : toyOverfitOk ? "phase_2_tiny_overfit_sanity" : tokenizerDryrunOk ? "phase_1_tokenizer_dry_run" : "phase_0_no_training_current",
    approval_markers_consumed_status: approvalMarkersConsumedOk ? "consumed_one_shot_markers_inert" : "needs_review",
    active_training_approval_count: activeTrainingApprovalCount,
    active_product_training_approval_count: activeProductTrainingApprovalCount,
    active_weight_commit_approval_count: activeWeightCommitApprovalCount,
    active_phase4_training_approval_count: activePhase4TrainingApprovalCount,
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
    r25y_run_status: r25yCompleteOk ? "passed_data_regularization_bounded_pilot" : r25yRunReport?.small_pilot_training_ran ? "needs_review" : r25yRunReport?.skipped ? "blocked_or_skipped" : "not_run",
    r25y_variant: r25yRunReport?.variant_id || r25yApproval?.variant_id || r25yRunConfig?.variant_id || r25yDataRegularizationConfig?.variant_id || null,
    r25y_actual_layers: r25yRunReport?.actual_layers ?? null,
    r25y_train_loss_decreased: r25yRunReport?.train_loss_decreased === true,
    r25y_dev_loss_finite: r25yRunReport?.dev_loss_finite === true,
    r25y_heldout_loss_status: r25yHeldoutOk ? "finite_replay_loss" : r25yHeldoutReport?.ok ? "needs_review" : "not_run",
    r25y_heldout_loss: Number.isFinite(Number(r25yHeldoutReport?.heldout_loss)) ? r25yHeldoutReport.heldout_loss : null,
    r25y_replayable_checkpoint_status: r25yEvalReport?.checkpoint_validates ? "valid_ignored_replayable_checkpoint" : r25yRunReport?.replayable_checkpoint_written ? "written_needs_validation" : "not_written",
    r25y_approval_consumed_status: r25yApproval?.consumed === true ? "consumed_one_shot_marker_inert" : r25yApproval?.approved ? "active_needs_consumption_after_attempt" : "not_present_or_not_approved",
    r25y_phase4_scaled_training: false,
    r25y_regularization_status: r25yRunReport?.data_regularization_training ? {
      learning_rate: r25yRunReport.learning_rate,
      knobs: r25yRunReport.regularization_knobs || null,
      helped_against_r25s: r25yHistoryReport?.data_regularization_helped ?? null,
      recommendation: r25yHistoryReport?.recommendation_category || null
    } : "not_run",
    r25y_history_comparison_status: r25yHistoryReport?.ok ? r25yHistoryReport.status : "not_run",
    r25x_recommendation: r25xPhase3ReviewReport?.ok ? r25xPhase3ReviewReport.recommendation : "not_run",
    r25y_analysis_status: r25yAnalysisReport?.ok ? r25yAnalysisReport.regularization_result || r25yAnalysisReport.classification : r25yAnalysisReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25y_overfit_risk: r25yAnalysisReport?.overfit_risk || "not_run",
    r25y_regularization_result: r25yAnalysisReport?.regularization_result || r25yDataRegularizationComparison?.recommendation || "not_run",
    r25y_heldout_breakdown_status: r25yHeldoutBreakdownReport?.ok ? (r25yHeldoutBreakdownReport.skipped ? "skipped_ignored_artifacts_missing" : "breakdown_ready") : "not_run",
    data_regularization_decision: r25yDataRegularizationComparison?.ok ? {
      best_pilot: r25yDataRegularizationComparison.best_pilot,
      r25y_helped_vs_r25s: r25yDataRegularizationComparison.r25y_helped_vs_r25s,
      r25y_helped_vs_r25v: r25yDataRegularizationComparison.r25y_helped_vs_r25v,
      r25y_helped_vs_r25p: r25yDataRegularizationComparison.r25y_helped_vs_r25p,
      recommendation: r25yDataRegularizationComparison.recommendation
    } : "not_run",
    phase3_decision_status_r25z: r25zPhase3DecisionLedger?.phase4_scaled_training_approved === false ? r25zPhase3DecisionLedger.current_decision?.phase3_status || "defined_phase4_blocked" : "not_present_or_needs_review",
    r25z_recommendation: r25zDecisionReport?.ok ? r25zDecisionReport.recommendation : "not_run",
    r25aa_approval_template_status: r25aaApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25aa_phase3_final_review_status: r25aaFinalReviewLedger?.phase3_status || "not_present_or_needs_review",
    r25aa_phase4_readiness_status: r25aaPhase4ReadinessReview?.phase4_scaled_training_approved === false ? (r25aaPhase4ReadinessReview.phase4_ready || "not_ready_not_approved") : "not_present_or_needs_review",
    r25aa_static_envelope_status: r25aaStaticEnvelopeReport?.ok ? r25aaStaticEnvelopeReport.recommendation : "not_run",
    r25aa_recommendation: r25aaPhase3PauseReport?.ok ? r25aaPhase3PauseReport.phase3_decision : "not_run",
    r25ab_approval_template_status: r25abApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25ab_project_meaning_status: r25abProjectMeaningOk ? "present_chinese_first_project_trained_not_project_reset" : "not_present_or_needs_review",
    chinese_first_training_direction_status: r25abChineseFirstOk ? "present_zh_primary_en_secondary" : "not_present_or_needs_review",
    personal_color_boundary_status: r25abPersonalBoundaryOk ? "present_no_private_raw_data" : "not_present_or_needs_review",
    healthy_training_cycle_status: r25abHealthyCycleOk ? "present_bounded_approval_consuming_pause_cycle" : "not_present_or_needs_review",
    r25ac_design_status: r25acCompleteOk ? "bounded_microcycle_history_ready" : r25acDesignOk ? "designed_not_approved_chinese_personal_microcycle" : "not_present_or_needs_review",
    r25ac_approval_template_status: r25acApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25ab_training_status: "no_training_ran",
    r25ac_run_status: r25acCompleteOk ? "passed_bounded_chinese_personal_microcycle" : r25acRunReport?.small_pilot_training_ran ? "needs_review" : r25acRunReport?.skipped ? "blocked_or_skipped" : "not_run",
    r25ac_variant: r25acRunReport?.variant_id || r25acApproval?.variant_id || r25acRunConfig?.variant_id || null,
    r25ac_actual_layers: r25acRunReport?.actual_layers ?? null,
    r25ac_language_mix: r25acRunReport?.actual_language_mix || r25acDatasetReport?.actual_train_language_mix || null,
    r25ac_language_mix_status: r25acLanguageMixOk ? "zh_primary_en_capped" : r25acDatasetReport?.ok ? "needs_review" : "not_run",
    r25ac_personal_target_coverage: r25acRunReport?.personal_target_coverage || r25acDatasetReport?.personal_target_coverage || null,
    r25ac_personal_target_coverage_status: r25acPersonalCoverageOk ? "covered_structural_project_labels" : r25acDatasetReport?.ok ? "needs_review" : "not_run",
    r25ac_train_loss_decreased: r25acRunReport?.train_loss_decreased === true,
    r25ac_dev_loss_finite: r25acRunReport?.dev_loss_finite === true,
    r25ac_heldout_loss_status: r25acHeldoutOk ? "finite_replay_loss" : r25acHeldoutReport?.ok ? "needs_review" : "not_run",
    r25ac_heldout_loss: Number.isFinite(Number(r25acHeldoutReport?.heldout_loss)) ? r25acHeldoutReport.heldout_loss : null,
    r25ac_chinese_breakdown_status: r25acBreakdownReport?.ok ? "breakdown_ready" : r25acBreakdownReport?.skipped ? "skipped_ignored_artifacts_missing" : "not_run",
    r25ac_history_comparison_status: r25acHistoryReport?.ok ? r25acHistoryReport.recommendation_category || r25acHistoryReport.status : "not_run",
    r25ac_approval_consumed_status: r25acApproval?.consumed === true ? "consumed_one_shot_marker_inert" : r25acApproval?.approved ? "active_needs_consumption_after_attempt" : "not_present_or_not_approved",
    r25ac_approved: r25acApproval?.approved === true,
    r25ac_phase4_scaled_training: false,
    r25ab_chinese_first_corpus_audit_status: r25abCorpusAudit?.ok ? (r25abCorpusAudit.current_r25l_insufficient_for_new_chinese_first_target ? "passed_current_r25l_insufficient_for_new_target" : "passed_current_r25l_meets_target") : "not_run",
    r25ab_chinese_first_corpus_distribution: r25abCorpusAudit?.current_distribution || null,
    r25ab_chinese_first_target_distribution: r25abCorpusAudit?.target_distribution || {
      zh_min: 0.7,
      mixed_target: 0.2,
      en_max: 0.1
    },
    r25ad_r25ac_analysis_status: r25adR25acAnalysisOk ? r25adR25acAnalysisReport.classification : r25adR25acAnalysisReport?.ok ? "needs_review" : "not_run",
    r25ad_r25ac_losses: r25adR25acAnalysisReport?.losses || null,
    r25ad_r25ac_comparison_status: r25adHistoryComparisonReport?.chinese_personal_review ? (r25adHistoryComparisonReport.r25ad_interpretation?.r25s_remains_best_by_heldout_loss ? "r25s_remains_best_by_loss" : "needs_review") : "not_run",
    r25ad_personal_target_coverage_status: r25adPersonalTargetCoverageOk ? "passed_structural_personal_target_coverage" : r25adPersonalTargetCoverageReport?.ok ? "needs_review" : "not_run",
    r25ad_chinese_corpus_gap_status: r25adChineseCorpusGapOk ? "gap_confirmed_expand_reviewed_zh_mixed" : r25adChineseCorpusGapReport?.ok ? "needs_review" : "not_run",
    r25ad_chinese_corpus_gap: r25adChineseCorpusGapReport?.current_r25l_distribution || null,
    r25ad_chinese_corpus_target_distribution: r25adChineseCorpusGapReport?.target_distribution || {
      zh_min: 0.7,
      mixed_target: 0.2,
      en_max: 0.1
    },
    r25ae_design_status: r25aeDesignOk ? "future_design_only_not_approved" : r25aeCorpusExpansionPlan ? "needs_review" : "not_present",
    r25ae_approval_template_status: r25aeApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25ae_personal_inventory_status: r25aePersonalInventoryOk ? "passed_repo_scoped_metadata_only_inventory" : r25aeInventoryReport?.ok ? "needs_review" : "not_run",
    r25ae_personal_corpus_signal_status: r25aeCorpusSignalOk ? "passed_aggregate_corpus_signal_profile" : r25aeCorpusSignalProfile?.ok ? "needs_review" : "not_run",
    r25ae_legacy_disk_scan_status: r25aeLegacyDiskScanOk ? "passed_repo_scoped_legacy_footprint_audit" : r25aeLegacyDiskScanAudit?.ok ? "needs_review" : "not_run",
    r25ae_boundary_check_status: r25aeBoundaryCheckOk ? "passed_no_training_no_ingestion_no_artifact_stage" : r25aeBoundaryCheckReport?.ok === false ? "failed" : "not_run",
    estimated_personal_training_signal_level: r25aeEstimatedPersonalSignalLevel,
    r25ae_inventory_counts: r25aeInventoryReport?.ok ? {
      tracked_training_corpus_files: r25aeInventoryReport.categories?.tracked_training_corpus?.file_count ?? null,
      untracked_root_documents: r25aeInventoryReport.categories?.untracked_root_documents?.file_count ?? null,
      untracked_root_document_bytes: r25aeInventoryReport.categories?.untracked_root_documents?.total_bytes ?? null,
      data_public_ingestion_files: r25aeInventoryReport.categories?.untracked_public_ingestion?.file_count ?? null,
      data_public_ingestion_bytes: r25aeInventoryReport.categories?.untracked_public_ingestion?.total_bytes ?? null,
      ignored_artifacts_files: r25aeInventoryReport.categories?.ignored_artifacts?.file_count ?? null,
      ignored_artifacts_bytes: r25aeInventoryReport.categories?.ignored_artifacts?.total_bytes ?? null
    } : null,
    r25ae_corpus_signal_counts: r25aeCorpusSignalProfile?.ok ? {
      row_counts_by_source: r25aeCorpusSignalProfile.row_counts_by_source || null,
      language_counts: r25aeCorpusSignalProfile.language_counts || null,
      answer_like_total: r25aeCorpusSignalProfile.answer_like_total ?? null,
      target_answer_rows: r25aeCorpusSignalProfile.target_answer_rows ?? null,
      rejected_answers_rows: r25aeCorpusSignalProfile.rejected_answers_rows ?? null,
      provenance_counts: r25aeCorpusSignalProfile.provenance_counts || null,
      private_data_flag_counts: r25aeCorpusSignalProfile.private_data_flag_counts || null,
      personal_color_signal_counts: r25aeCorpusSignalProfile.personal_color_signal_counts || null,
      duplicate_template_findings: r25aeCorpusSignalProfile.duplicate_template_findings || null
    } : null,
    r25ae_legacy_disk_scan_findings: r25aeLegacyDiskScanAudit?.ok ? {
      findings_count: r25aeLegacyDiskScanAudit.findings_count ?? null,
      feed_counts: r25aeLegacyDiskScanAudit.feed_counts || null,
      early_hard_drive_scan_imported_useful_training_material: r25aeLegacyDiskScanAudit.early_hard_drive_scan_imported_useful_training_material === true,
      root_personal_files_ingested_into_training_corpus: r25aeLegacyDiskScanAudit.root_personal_files_ingested_into_training_corpus === true,
      data_public_ingestion_ingested_into_training_corpus: r25aeLegacyDiskScanAudit.data_public_ingestion_ingested_into_training_corpus === true
    } : null,
    r25af_personal_writing_intake_status: r25afPersonalWritingIntakeOk ? "passed_metadata_only_inbox_design" : r25afInboxAudit?.ok ? "needs_review" : "not_run",
    r25af_transformation_readiness_status: r25afTransformationReadinessOk ? "passed_no_raw_source_no_generation_no_training" : r25afReadinessReport?.ok === false ? "failed" : "not_run",
    r25af_source_manifest_schema_status: r25afSourceSchema ? "present_default_parse_and_commit_false" : "not_present",
    r25af_transformation_taxonomy_status: r25afTransformationDocPresent && r25afTransformationSchema ? "present_dialogue_shaped_chinese_first" : "not_present",
    r25ag_design_status: r25agDesignOk ? "future_design_only_not_approved" : r25agCorpusExpansionPlan ? "needs_review" : "not_present",
    r25ag_approval_template_status: r25agApprovalTemplateSafe ? "inert_template_approved_false" : "not_present_or_needs_review",
    r25ag_repo_text_discovery_status: r25agRepoTextDiscoveryOk ? "passed_repo_root_metadata_safe_discovery" : r25agRepoTextDiscoveryReport?.ok ? "needs_review" : "not_run",
    r25ag_existing_answer_audit_status: r25agExistingAnswerAuditOk ? "passed_aggregate_answer_like_audit" : r25agExistingAnswerAuditReport?.ok ? "needs_review" : "not_run",
    r25ag_personal_source_ranking_status: r25agPersonalSourceRankingOk ? "passed_candidate_source_ranking" : r25agPersonalSourceRankingReport?.ok ? "needs_review" : "not_run",
    r25ag_legacy_scan_reconciliation_status: r25agLegacyScanReconciliationOk ? "passed_legacy_scan_reconciliation" : r25agLegacyScanReconciliationReport?.ok ? "needs_review" : "not_run",
    r25ag_repo_text_boundary_status: r25agRepoDiscoveryBoundaryOk ? "passed_no_training_no_generation_no_artifact_stage" : r25agRepoDiscoveryBoundaryReport?.ok === false ? "failed" : "not_run",
    estimated_existing_personal_signal_level: r25agEstimatedExistingPersonalSignalLevel,
    r25ag_repo_text_discovery_counts: r25agRepoTextDiscoveryReport?.ok ? {
      tracked_text_source_count: r25agRepoTextDiscoveryReport.summary?.tracked_text_source_count ?? null,
      untracked_text_source_count: r25agRepoTextDiscoveryReport.summary?.untracked_text_source_count ?? null,
      ignored_report_artifact_count: r25agRepoTextDiscoveryReport.summary?.ignored_report_artifact_count ?? null,
      root_pdf_docx_metadata_count: r25agRepoTextDiscoveryReport.summary?.root_pdf_docx_metadata_count ?? null,
      data_public_ingestion_metadata_count: r25agRepoTextDiscoveryReport.summary?.data_public_ingestion_metadata_count ?? null,
      data_public_ingestion_total_bytes: r25agRepoTextDiscoveryReport.summary?.data_public_ingestion_total_bytes ?? null,
      category_counts: r25agRepoTextDiscoveryReport.summary?.category_counts || null
    } : null,
    r25ag_source_ranking_summary: r25agPersonalSourceRankingReport?.ok ? {
      value_rank_counts: r25agPersonalSourceRankingReport.summary?.value_rank_counts || null,
      high_value_categories: r25agPersonalSourceRankingReport.summary?.high_value_categories || null,
      recommended_next_action: r25agPersonalSourceRankingReport.summary?.recommended_next_action || null
    } : null,
    r25ag_existing_answer_like_counts: r25agExistingAnswerAuditReport?.ok ? {
      rows_by_source: r25agExistingAnswerAuditReport.summary?.rows_by_source || null,
      total_answer_like_fields: r25agExistingAnswerAuditReport.summary?.total_answer_like_fields ?? null,
      target_answer_rows: r25agExistingAnswerAuditReport.summary?.target_answer_rows ?? null,
      rejected_answers_rows: r25agExistingAnswerAuditReport.summary?.rejected_answers_rows ?? null,
      rejected_answers_total_items: r25agExistingAnswerAuditReport.summary?.rejected_answers_total_items ?? null,
      long_horizon_row_count: r25agExistingAnswerAuditReport.summary?.long_horizon_row_count ?? null,
      identity_pack_row_count: r25agExistingAnswerAuditReport.summary?.identity_pack_row_count ?? null,
      knowledge_sources_row_count: r25agExistingAnswerAuditReport.summary?.knowledge_sources_row_count ?? null,
      eval_only_row_count: r25agExistingAnswerAuditReport.summary?.eval_only_row_count ?? null,
      language_counts_training_corpus: r25agExistingAnswerAuditReport.summary?.language_counts_training_corpus || null,
      personal_color_signal_counts: r25agExistingAnswerAuditReport.summary?.personal_color_signal_counts || null,
      provenance_counts: r25agExistingAnswerAuditReport.summary?.provenance_counts || null,
      duplicate_template_findings: r25agExistingAnswerAuditReport.summary?.duplicate_template_findings || null
    } : null,
    r25ag_legacy_scan_reconciliation_findings: r25agLegacyScanReconciliationReport?.ok ? {
      possible_scan_output_count: r25agLegacyScanReconciliationReport.summary?.possible_scan_output_count ?? null,
      feed_counts: r25agLegacyScanReconciliationReport.summary?.feed_counts || null,
      early_hard_drive_scan_imported_useful_training_material: r25agLegacyScanReconciliationReport.summary?.early_hard_drive_scan_imported_useful_training_material === true,
      root_personal_files_ingested_into_training_corpus: r25agLegacyScanReconciliationReport.summary?.root_personal_files_ingested_into_training_corpus === true,
      data_public_ingestion_ingested_into_training_corpus: r25agLegacyScanReconciliationReport.summary?.data_public_ingestion_ingested_into_training_corpus === true
    } : null,
    r25af_inbox_audit: r25afInboxAudit?.ok ? {
      private_sources_exists: r25afInboxAudit.private_sources_exists === true,
      status: r25afInboxAudit.status || null,
      file_count: r25afInboxAudit.file_count ?? null,
      total_bytes: r25afInboxAudit.total_bytes ?? null,
      extension_distribution: r25afInboxAudit.extension_distribution || null,
      category_distribution: r25afInboxAudit.category_distribution || null,
      raw_file_content_parsed: r25afInboxAudit.raw_file_content_parsed === true
    } : null,
    r25af_training_status: "design_only_no_training_no_corpus_generation",
    r25ag_training_status: "repo_text_discovery_only_no_training_no_corpus_generation",
    r25ad_recommendation: r25adNextStepReport?.recommendation || "not_run",
    r25ad_training_status: "no_training_ran",
    r25ae_training_status: "audit_only_no_training",
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
      ] : []),
      ...(r25yCompleteOk ? [
        "training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25y.json",
        "artifacts/training_os/small_decoder_pilot/r25y/r25y_small_decoder_run_report.json",
        "artifacts/training_os/small_decoder_pilot/r25y/r25y_replayable_checkpoint.json",
        "artifacts/training_os/small_decoder_pilot/r25y/r25y_heldout_eval_report.json",
        "artifacts/training_os/small_decoder_pilot/r25y/r25y_history_comparison.json"
      ] : []),
      ...(r25zAnalysisOk ? [
        "training/from_scratch/phase3_decision_ledger.r25z.json",
        "training/from_scratch/APPROVE_R25AA_NEXT_STEP.template.json",
        "artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_analysis.json",
        "artifacts/training_os/small_decoder_pilot/r25z/r25z_r25y_heldout_breakdown.json",
        "artifacts/training_os/small_decoder_pilot/r25z/r25z_data_regularization_comparison.json",
        "artifacts/training_os/small_decoder_pilot/r25z/r25z_next_step_decision.json"
      ] : []),
      ...(r25aaReviewOk ? [
        "training/from_scratch/phase3_final_review_ledger.r25aa.json",
        "training/from_scratch/phase4_readiness_review.r25aa.json",
        "training/from_scratch/phase4_scaled_architecture_envelope.r25aa.json",
        "training/from_scratch/APPROVE_R25AB_PHASE4_READINESS.template.json",
        "artifacts/training_os/phase4_readiness/r25aa_phase4_readiness_check_report.json",
        "artifacts/training_os/phase4_readiness/r25aa_static_envelope_report.json",
        "artifacts/training_os/phase4_readiness/r25aa_phase3_pause_decision.json"
      ] : []),
      ...(r25abDirectionOk ? [
        "docs/R25AB_PROJECT_MEANING.md",
        "docs/R25AB_CHINESE_FIRST_TRAINING_DOCTRINE.md",
        "docs/R25AB_PERSONAL_COLOR_BOUNDARY.md",
        "docs/R25AB_HEALTHY_TRAINING_CYCLE.md",
        "training/from_scratch/personal_color_boundary.r25ab.json",
        "training/from_scratch/healthy_training_cycle.r25ab.json",
        "training/from_scratch/small_decoder_r25ac_chinese_personal_config.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25ac.template.json",
        "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.template.json"
      ] : []),
      ...(r25acCompleteOk ? [
        "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json",
        "training/from_scratch/small_decoder_pilot_run_config.r25ac.json",
        "docs/R25AC_CHINESE_PERSONAL_MICROCYCLE_RUN.md",
        "docs/R25AC_CHINESE_HELDOUT_EVAL.md",
        "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_small_decoder_run_report.json",
        "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_replayable_checkpoint.json",
        "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_heldout_eval_report.json",
        "artifacts/training_os/small_decoder_pilot/r25ac/r25ac_chinese_personal_breakdown.json"
      ] : []),
      ...(r25adReviewOk ? [
        "docs/R25AD_R25AC_ANALYSIS_AND_DECISION.md",
        "docs/R25AD_CHINESE_PERSONAL_CORPUS_GAP.md",
        "docs/R25AD_R25AE_CORPUS_EXPANSION_DESIGN.md",
        "training/from_scratch/chinese_personal_corpus_expansion_plan.r25ae.json",
        "training/from_scratch/APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json",
        "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_r25ac_analysis.json",
        "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_personal_target_coverage.json",
        "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_chinese_personal_corpus_gap.json",
        "artifacts/training_os/small_decoder_pilot/r25ad/r25ad_next_step_decision.json"
      ] : []),
      ...(r25aeInventoryAuditOk ? [
        "docs/R25AE_PERSONAL_DATA_INVENTORY.md",
        "docs/R25AE_PERSONAL_DATA_INVENTORY_POLICY.md",
        "docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md",
        "docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md",
        "docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md",
        "training/from_scratch/personal_data_inventory_policy.r25ae.json",
        "artifacts/training_os/personal_inventory/r25ae/personal_data_inventory.json",
        "artifacts/training_os/personal_inventory/r25ae/personal_corpus_signal_profile.json",
        "artifacts/training_os/personal_inventory/r25ae/legacy_disk_scan_footprint_audit.json",
        "artifacts/training_os/personal_inventory/r25ae/personal_data_inventory_boundary_check.json"
      ] : []),
      ...(r25afIntakeDesignOk ? [
        "docs/R25AF_PERSONAL_WRITING_INTAKE_POLICY.md",
        "docs/R25AF_WRITING_TO_DIALOGUE_TRANSFORMATION.md",
        "docs/R25AF_R25AG_CORPUS_EXPANSION_PATH.md",
        "training/from_scratch/personal_writing_intake_policy.r25af.json",
        "training/from_scratch/personal_writing_source.schema.json",
        "training/from_scratch/personal_writing_source_manifest.template.json",
        "training/from_scratch/personal_writing_transformation.schema.json",
        "training/from_scratch/chinese_personal_corpus_expansion_plan.r25ag.json",
        "training/from_scratch/APPROVE_R25AG_DERIVED_CORPUS_EXPANSION.template.json",
        "artifacts/training_os/personal_writing_intake/r25af/personal_writing_inbox_audit.json",
        "artifacts/training_os/personal_writing_intake/r25af/personal_writing_transformation_readiness.json"
      ] : []),
      ...(r25agRepoTextDiscoveryOkAll ? [
        "docs/R25AG_REPOSITORY_TEXT_DISCOVERY_POLICY.md",
        "docs/R25AG_REPOSITORY_TEXT_DISCOVERY.md",
        "docs/R25AG_REPOSITORY_TEXT_SOURCE_SUMMARY.md",
        "docs/R25AG_PERSONAL_CORPUS_SOURCE_RANKING.md",
        "docs/R25AG_EXISTING_ANSWER_LIKE_TEXT_SUMMARY.md",
        "docs/R25AG_LEGACY_SCAN_RECONCILIATION.md",
        "training/from_scratch/repository_text_discovery_policy.r25ag.json",
        "artifacts/training_os/repo_text_discovery/r25ag/repository_text_sources.json",
        "artifacts/training_os/repo_text_discovery/r25ag/personal_corpus_source_ranking.json",
        "artifacts/training_os/repo_text_discovery/r25ag/existing_answer_like_text_audit.json",
        "artifacts/training_os/repo_text_discovery/r25ag/legacy_scan_reconciliation.json",
        "artifacts/training_os/repo_text_discovery/r25ag/repo_text_discovery_boundary_check.json"
      ] : [])
    ],
    missing_before_training: [
      ...(r25lCorpusOk ? [] : ["reviewed expanded corpus with clean train/dev/heldout split"]),
      ...(tokenizerDryrunOk ? [] : ["tokenizer dry-run and held-out tokenizer evaluation"]),
      ...(toyOverfitOk ? [] : ["explicit phase_2 approval and passing toy-only overfit sanity"]),
      ...(r25lTokenizerDryrunOk ? [] : ["expanded-corpus tokenizer dry-run and eval"]),
      ...(smallPilotPlanOk ? [] : ["small decoder pilot architecture, budget, and capacity plan"]),
      ...(r25pCompleteOk
        ? [r25agRepoTextDiscoveryOkAll ? "review R25AG discovery and optionally approve R25AH source-specific derived-row generation from selected existing repo text; future training still needs separate fresh approval and phase_4 scaled training remains blocked" : r25afIntakeDesignOk ? "review R25AF and optionally approve R25AG repository text discovery or derived Chinese-personal corpus expansion only; future training still needs separate fresh approval and phase_4 scaled training remains blocked" : r25aeInventoryAuditOk ? "review R25AE and optionally approve R25AF intake design only; any later corpus expansion or bounded micro-cycle still needs separate fresh approval and phase_4 scaled training remains blocked" : r25adReviewOk ? "review and optionally approve R25AE repository-scoped inventory only; any later corpus expansion or bounded micro-cycle still needs separate fresh approval and phase_4 scaled training remains blocked" : r25acCompleteOk ? "review R25AC before any follow-up; a future bounded Chinese-first personal micro-cycle needs fresh approval and phase_4 scaled training remains blocked" : r25abDirectionOk ? "review and optionally approve exactly one future R25AC Chinese-first personal micro-cycle; phase_4 scaled training remains blocked" : r25aaReviewOk ? "pause phase_3 for human review or begin R25AB phase_4 design review without training; phase_4 scaled training remains blocked" : r25zAnalysisOk ? "pause phase_3 for review or begin a phase_4 readiness review without training; phase_4 scaled training remains blocked" : r25yCompleteOk ? "review R25Y against R25S/R25V/R25P before any R25Z decision, repeat data regularization, or phase_4 readiness review; phase_4 remains blocked" : r25xReviewOk ? "review R25X and obtain fresh reviewer approval before any R25Y data-regularization pilot; phase_4 remains blocked" : r25wAnalysisOk ? "pause phase_3 for review or design data/regularization only after fresh approval; phase_4 remains blocked" : r25vCompleteOk || r25vBlockedOk ? "review R25V against R25S before any additional phase_3 pilot; phase_4 remains blocked" : r25uPlanningOk ? "fresh reviewer approval before any R25V phase_3 ablation or data follow-up; phase_4 remains blocked" : r25sCompleteOk ? "review R25S against R25P before any additional pilot, architecture ablation, or scaling" : r25sDesignOk ? "fresh reviewer approval before any R25S data-first bounded pilot" : r25qAnalysisOk ? "review R25Q before any R25R approval or architecture scaling" : "review R25P against R25M before any additional pilot or architecture scaling"]
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
    ],
    r25y_boundaries: [
      "R25Y runs or safely blocks exactly one approved data-regularization phase_3 pilot attempt",
      "R25Y is not product-scale training, long-term training, phase_4 scaled training, release admission, or a browser static artifact",
      "R25Y replayable checkpoint, if written, is ignored and not commit-allowed",
      "future training requires a fresh reviewer approval marker"
    ],
    r25z_boundaries: [
      "R25Z analyzes R25Y and does not run training",
      "R25S remains best-so-far after R25Y does not beat it",
      "phase_4 scaled training remains not approved",
      "R25AA template is inert and future work requires fresh approval"
    ],
    r25aa_boundaries: [
      "R25AA runs no training and reruns no prior pilot",
      "R25AA pauses phase_3 for review and performs phase_4 readiness analysis only",
      "R25AB template is approved:false and cannot authorize training",
      "phase_4 scaled training remains not approved and product training progress remains 0%"
    ],
    r25ab_boundaries: [
      "R25AB aligns Chinese-first personal model direction and does not run training",
      "R25AB defines personal color as reviewed project style and preferences, not private raw data",
      "R25AC is design-only and requires fresh approval before exactly one bounded micro-cycle",
      "phase_4 scaled training remains not approved and product training progress remains 0%"
    ],
    r25ac_boundaries: [
      "R25AC runs exactly one approved bounded Chinese-first personal micro-cycle",
      "R25AC is not product-scale training, long-term training, phase_4 scaled training, release admission, or a browser static artifact",
      "R25AC replayable checkpoint is ignored and not commit-allowed",
      "future training requires a fresh reviewer approval marker"
    ],
    r25ad_boundaries: [
      "R25AD analyzes R25AC and does not train or rerun any pilot",
      "R25AD recommends reviewed Chinese-personal corpus expansion before any new micro-cycle",
      "R25AD queues repository-scoped personal-data inventory before any expansion or training",
      "phase_4 scaled training remains not approved and product training progress remains 0%"
    ],
    r25ae_boundaries: [
      "R25AE inventories repository-scoped personal-data surfaces and does not train",
      "R25AE does not expand corpus, does not scan outside the repo, and keeps root documents plus data/public_ingestion metadata-only",
      "R25AE generated inventory artifacts are ignored and not commit candidates",
      "future R25AF intake design, R25AG derived corpus expansion, and any later training each require fresh approval; phase_4 remains blocked"
    ],
    r25af_boundaries: [
      "R25AF designs personal writing intake and transformation only; it does not train or generate corpus rows",
      "raw writing, poetry, essays, fragments, and notes remain private/local by default under ignored private_sources",
      "R25AG may later generate derived Chinese-personal rows only after fresh approval; future training needs another approval",
      "phase_4 scaled training remains not approved and product training progress remains 0%"
    ],
    r25ag_boundaries: [
      "R25AG repository text discovery catalogs existing repo-local text surfaces only",
      "R25AG does not train, generate corpus rows, promote derived rows, or modify training/llm_corpus",
      "root PDFs/DOCX and data/public_ingestion stay metadata-only",
      "future R25AH derived-row generation from selected repo text requires fresh approval; phase_4 remains blocked"
    ]
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
