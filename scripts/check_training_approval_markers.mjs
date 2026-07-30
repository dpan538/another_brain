#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MARKERS = [
  {
    id: "r25k_toy_overfit",
    path: "training/from_scratch/APPROVE_R25K_TOY_OVERFIT.json",
    expectedScope: "toy_overfit_sanity_only",
    expectedPhase: "phase_2_tiny_overfit_sanity",
    consumedByCommit: "0a3b5a65f4a28e09aed66aa2cd722608a2b377ba",
    trainingFlagKeys: []
  },
  {
    id: "r25m_small_decoder_pilot",
    path: "training/from_scratch/APPROVE_R25M_SMALL_DECODER_PILOT.json",
    expectedScope: "small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "56613c64ef2c7400f13be051030c09883877fa5d",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25p_second_small_pilot_template",
    path: "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.template.json",
    expectedScope: "second_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25p_second_small_pilot",
    path: "training/from_scratch/APPROVE_R25P_SECOND_SMALL_PILOT.json",
    expectedScope: "second_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25p_commit",
    expectedRunId: "r25p_more_sequences_128",
    expectedVariantId: "r25p_more_sequences_128",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25r_next_small_pilot_template",
    path: "training/from_scratch/APPROVE_R25R_NEXT_SMALL_PILOT.template.json",
    expectedScope: "next_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25s_data_first_pilot_template",
    path: "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.template.json",
    expectedScope: "data_first_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25s_data_first_balanced_192",
    expectedVariantId: "r25s_data_first_balanced_192",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25s_data_first_pilot",
    path: "training/from_scratch/APPROVE_R25S_DATA_FIRST_PILOT.json",
    expectedScope: "data_first_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25s_commit",
    expectedRunId: "r25s_data_first_balanced_192",
    expectedVariantId: "r25s_data_first_balanced_192",
    trainingFlagKeys: ["allow_small_pilot_training"]
  },
  {
    id: "r25u_architecture_ablation_template",
    path: "training/from_scratch/APPROVE_R25U_ARCHITECTURE_ABLATION.template.json",
    expectedScope: "architecture_ablation_design_or_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_architecture_ablation_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25v_next_pilot_template",
    path: "training/from_scratch/APPROVE_R25V_NEXT_PILOT.template.json",
    expectedScope: "next_phase3_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_architecture_ablation_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25v_architecture_ablation",
    path: "training/from_scratch/APPROVE_R25V_ARCHITECTURE_ABLATION.json",
    expectedScope: "phase3_architecture_ablation_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "76530ac",
    expectedRunId: "r25v_two_layer_same_width",
    expectedVariantId: "two_layer_same_width",
    trainingFlagKeys: ["allow_small_pilot_training", "allow_architecture_ablation_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25x_future_pilot_template",
    path: "training/from_scratch/APPROVE_R25X_FUTURE_PILOT.template.json",
    expectedScope: "future_phase3_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_data_refinement_training", "allow_architecture_ablation_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25y_data_regularization_template",
    path: "training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.template.json",
    expectedScope: "data_regularization_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25y_data_regularized_192",
    expectedVariantId: "r25y_data_regularized_192",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_data_regularization_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25y_data_regularization_pilot",
    path: "training/from_scratch/APPROVE_R25Y_DATA_REGULARIZATION_PILOT.json",
    expectedScope: "data_regularization_small_decoder_pilot_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25y_commit",
    expectedRunId: "r25y_data_regularized_192",
    expectedVariantId: "r25y_data_regularized_192",
    trainingFlagKeys: ["allow_small_pilot_training", "allow_data_regularization_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25aa_next_step_template",
    path: "training/from_scratch/APPROVE_R25AA_NEXT_STEP.template.json",
    expectedScope: "future_reviewed_next_step_only",
    expectedPhase: "phase_3_or_phase4_review",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_data_regularization_training", "allow_architecture_ablation_training", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25ab_phase4_readiness_template",
    path: "training/from_scratch/APPROVE_R25AB_PHASE4_READINESS.template.json",
    expectedScope: "phase4_readiness_review_only",
    expectedPhase: "phase_4_scaled_decoder_training_review",
    template: true,
    trainingFlagKeys: ["allow_phase4_design", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25ac_chinese_personal_microcycle_template",
    path: "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.template.json",
    expectedScope: "chinese_personal_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25ac_chinese_personal_microcycle_256",
    expectedVariantId: "r25ac_chinese_personal_microcycle_256",
    template: true,
    trainingFlagKeys: ["allow_small_pilot_training", "allow_chinese_personal_microcycle", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25ac_chinese_personal_microcycle",
    path: "training/from_scratch/APPROVE_R25AC_CHINESE_PERSONAL_MICROCYCLE.json",
    expectedScope: "chinese_personal_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    consumedByCommit: "pending_r25ac_commit",
    expectedRunId: "r25ac_chinese_personal_microcycle_256",
    expectedVariantId: "r25ac_chinese_personal_microcycle_256",
    trainingFlagKeys: ["allow_small_pilot_training", "allow_chinese_personal_microcycle", "allow_phase_4_scaled_training"]
  },
  {
    id: "r25ae_chinese_personal_corpus_expansion_template",
    path: "training/from_scratch/APPROVE_R25AE_CHINESE_PERSONAL_CORPUS_EXPANSION.template.json",
    expectedScope: "chinese_personal_corpus_expansion_only",
    expectedPhase: "phase_3_corpus_expansion",
    expectedRunId: "r25ae_chinese_personal_corpus_expansion",
    template: true,
    trainingFlagKeys: [
      "allow_corpus_generation",
      "allow_training",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_external_llm_generation",
      "allow_private_data_sources",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r25ai_promote_repo_derived_candidates_template",
    path: "training/from_scratch/APPROVE_R25AI_PROMOTE_REPO_DERIVED_CANDIDATES.template.json",
    expectedScope: "promote_reviewed_repo_derived_candidates_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25ai_promote_reviewed_repo_derived_candidates",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25ak_promote_unique_repo_derived_candidates_template",
    path: "training/from_scratch/APPROVE_R25AK_PROMOTE_UNIQUE_REPO_DERIVED_CANDIDATES.template.json",
    expectedScope: "promote_reviewed_unique_repo_derived_candidates_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25ak_promote_reviewed_unique_repo_derived_candidates",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25ak_promote_unique_repo_derived_candidates",
    path: "training/from_scratch/APPROVE_R25AK_PROMOTE_UNIQUE_REPO_DERIVED_CANDIDATES.json",
    expectedScope: "promote_reviewed_unique_repo_derived_candidates_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25ak_promote_reviewed_unique_repo_derived_candidates",
    consumedByCommit: "pending_r25ak_commit",
    trainingFlagKeys: [
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25al_post_promotion_corpus_review_template",
    path: "training/from_scratch/APPROVE_R25AL_POST_PROMOTION_CORPUS_REVIEW.template.json",
    expectedScope: "post_promotion_corpus_review_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25al_post_promotion_corpus_review",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25al_post_promotion_corpus_review",
    path: "training/from_scratch/APPROVE_R25AL_POST_PROMOTION_CORPUS_REVIEW.json",
    expectedScope: "post_promotion_corpus_and_tokenizer_readiness_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25al_post_promotion_corpus_review",
    consumedByCommit: "pending_r25al_commit",
    trainingFlagKeys: [
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25am_expanded_chinese_personal_microcycle_template",
    path: "training/from_scratch/APPROVE_R25AM_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.template.json",
    expectedScope: "expanded_chinese_personal_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25am_expanded_chinese_personal_microcycle",
    template: true,
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_decoder_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25am_second_chinese_corpus_expansion",
    path: "training/from_scratch/APPROVE_R25AM_SECOND_CHINESE_CORPUS_EXPANSION.json",
    expectedScope: "second_chinese_personal_repo_derived_corpus_expansion_only",
    expectedPhase: "phase_3_corpus_expansion",
    expectedRunId: "r25am_second_chinese_personal_corpus_expansion",
    consumedByCommit: "pending_r25am_commit",
    trainingFlagKeys: [
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25an_post_r25am_tokenizer_review_template",
    path: "training/from_scratch/APPROVE_R25AN_POST_R25AM_TOKENIZER_REVIEW.template.json",
    expectedScope: "post_r25am_tokenizer_review_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25an_post_r25am_tokenizer_review",
    template: true,
    trainingFlagKeys: [
      "allow_tokenizer_dry_run",
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25an_post_r25am_tokenizer_review",
    path: "training/from_scratch/APPROVE_R25AN_POST_R25AM_TOKENIZER_REVIEW.json",
    expectedScope: "post_r25am_tokenizer_and_sampler_review_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r25an_post_r25am_tokenizer_review",
    consumedByCommit: "pending_r25an_commit",
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25ao_expanded_chinese_personal_microcycle_template",
    path: "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.template.json",
    expectedScope: "expanded_chinese_personal_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25ao_expanded_chinese_personal_microcycle",
    expectedVariantId: "r25ao_sampler_zh70_mixed20_en10",
    template: true,
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_decoder_training",
      "allow_bounded_decoder_pilot_training",
      "allow_formal_decoder_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25ao_expanded_chinese_personal_microcycle",
    path: "training/from_scratch/APPROVE_R25AO_EXPANDED_CHINESE_PERSONAL_MICROCYCLE.json",
    expectedScope: "expanded_chinese_personal_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25ao_expanded_chinese_personal_microcycle",
    expectedVariantId: "r25ao_sampler_zh70_mixed20_en10",
    consumedByCommit: "pending_r25ao_commit",
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_bounded_decoder_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training"
    ]
  },
  {
    id: "r25ap_analyze_r25ao_template",
    path: "training/from_scratch/APPROVE_R25AP_ANALYZE_R25AO.template.json",
    expectedScope: "analyze_r25ao_only",
    expectedPhase: "phase_3_small_decoder_pilot_analysis",
    expectedRunId: "r25ap_analyze_r25ao",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training"
    ]
  },
  {
    id: "r25aq_next_reviewed_step_template",
    path: "training/from_scratch/APPROVE_R25AQ_NEXT_REVIEWED_STEP.template.json",
    expectedScope: "future_reviewed_step_only",
    expectedPhase: "phase_3_analysis_or_pilot_review",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r25ar_repaired_sampler_template",
    path: "training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.template.json",
    expectedScope: "repaired_sampler_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25ar_repaired_sampler_microcycle",
    expectedVariantId: "r25ar_mixed_repair_lower_intensity",
    template: true,
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_decoder_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r25ar_repaired_sampler_microcycle",
    path: "training/from_scratch/APPROVE_R25AR_REPAIRED_SAMPLER_MICROCYCLE.json",
    expectedScope: "repaired_sampler_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r25ar_repaired_sampler_microcycle",
    expectedVariantId: "r25ar_mixed_repair_lower_intensity",
    consumedByCommit: "pending_r25ar_commit",
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_bounded_decoder_pilot_training",
      "allow_decoder_training",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r25as_analyze_r25ar_template",
    path: "training/from_scratch/APPROVE_R25AS_ANALYZE_R25AR.template.json",
    expectedScope: "analyze_r25ar_results_only",
    expectedPhase: "phase_3_analysis_or_pilot_review",
    expectedRunId: "r25as_analyze_r25ar_repaired_sampler",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r25at_phase3_review_next_step_template",
    path: "training/from_scratch/APPROVE_R25AT_PHASE3_REVIEW_NEXT_STEP.template.json",
    expectedScope: "phase3_review_next_step_only",
    expectedPhase: "phase_3_review",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_corpus_promotion",
      "allow_architecture_ablation",
      "allow_phase_4_scaled_training",
      "allow_long_term_training",
      "allow_product_model_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26e_promote_first50_user_answers_template",
    path: "training/from_scratch/APPROVE_R26E_PROMOTE_FIRST50_USER_ANSWERS.template.json",
    expectedScope: "promote_reviewed_first50_user_answer_candidates_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26e_promote_first50_user_answers",
    template: true,
    trainingFlagKeys: [
      "allow_promote_derived_rows",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26e_promote_first50_user_answers",
    path: "training/from_scratch/APPROVE_R26E_PROMOTE_FIRST50_USER_ANSWERS.json",
    expectedScope: "promote_reviewed_first50_user_answer_candidates_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26e_promote_first50_user_answers",
    consumedByCommit: "pending_r26e_commit",
    trainingFlagKeys: [
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26f_replacement_51_100_intake_template",
    path: "training/from_scratch/APPROVE_R26F_REPLACEMENT_51_100_INTAKE.template.json",
    expectedScope: "replacement_51_100_user_answer_intake_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26f_replacement_51_100_intake",
    template: true,
    trainingFlagKeys: [
      "allow_candidate_generation",
      "allow_promote_derived_rows",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26g_fix_r26e_metadata_or_repromote_template",
    path: "training/from_scratch/APPROVE_R26G_FIX_R26E_METADATA_OR_REPROMOTE.template.json",
    expectedScope: "fix_r26e_metadata_or_repromote_first50_after_audit_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26g_fix_r26e_metadata_or_repromote",
    template: true,
    trainingFlagKeys: [
      "allow_metadata_fix",
      "allow_repromotion",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_corpus_generation",
      "allow_raw_source_commit",
      "allow_candidate_artifact_commit",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26g_fix_and_intake_user_answers",
    path: "training/from_scratch/APPROVE_R26G_FIX_AND_INTAKE_USER_ANSWERS.json",
    expectedScope: "fix_r26e_metadata_and_intake_replacement_51_100_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26g_fix_and_intake_user_answers",
    consumedByCommit: "pending_r26g_commit",
    trainingFlagKeys: [
      "allow_candidate_generation",
      "allow_promote_derived_rows",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26h_user_answer_corpus_readiness_template",
    path: "training/from_scratch/APPROVE_R26H_USER_ANSWER_CORPUS_READINESS.template.json",
    expectedScope: "user_answer_corpus_readiness_review_only",
    expectedPhase: "phase_3_corpus_review",
    expectedRunId: "r26h_user_answer_corpus_readiness",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_small_pilot_training",
      "allow_phase_4_scaled_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r26i_answer_as_user_microcycle_template",
    path: "training/from_scratch/APPROVE_R26I_ANSWER_AS_USER_MICROCYCLE.template.json",
    expectedScope: "answer_as_user_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r26i_answer_as_user_microcycle",
    expectedVariantId: "r26i_user_answered_weighted_192",
    template: true,
    trainingFlagKeys: [
      "allow_small_pilot_training",
      "allow_decoder_training",
      "allow_training",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training",
      "allow_product_model_training",
      "allow_long_term_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r27b_p0_distilled_answer_as_user_microcycle_template",
    path: "training/from_scratch/APPROVE_R27B_P0_DISTILLED_ANSWER_AS_USER_MICROCYCLE.template.json",
    expectedScope: "p0_distilled_answer_as_user_microcycle_only",
    expectedPhase: "phase_3_small_decoder_pilot",
    expectedRunId: "r27b_p0_distilled_answer_as_user_microcycle",
    template: true,
    trainingFlagKeys: [
      "allow_training",
      "allow_decoder_training",
      "allow_small_pilot_training",
      "allow_teacher_output_intake",
      "allow_tokenizer_dry_run",
      "allow_phase_4_scaled_training",
      "allow_product_model_training",
      "allow_long_term_training",
      "allow_release_checkpoint",
      "allow_weight_commit"
    ]
  },
  {
    id: "r27a2_public_corpus_engineering_training",
    path: "training/from_scratch/APPROVE_R27A2_PUBLIC_CORPUS_ENGINEERING_TRAINING.json",
    expectedScope: "public_corpus_distillation_and_single_engineering_training_only",
    expectedPhase: "phase_3_engineering_model_lab",
    expectedRunId: "r27a2_public_corpus_engineering_training",
    consumedByCommit: "pending_r27a2_commit",
    trainingFlagKeys: [
      "allow_public_corpus_metadata_fetch",
      "allow_public_corpus_bounded_download",
      "allow_public_corpus_cleaning",
      "allow_tokenizer_training",
      "allow_engineering_training",
      "allow_decoder_training",
      "allow_lora_lab",
      "allow_phase_4_scaled_training",
      "allow_product_model_training",
      "allow_long_term_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r27a3_public_corpus_tokenizer_pilot",
    path: "training/from_scratch/APPROVE_R27A3_PUBLIC_CORPUS_TOKENIZER_PILOT.json",
    expectedScope: "public_corpus_activation_tokenizer_and_single_engineering_training_only",
    expectedPhase: "phase_3_engineering_model_lab",
    expectedRunId: "r27a3_public_corpus_tokenizer_pilot",
    consumedByCommit: "pending_r27a3_commit",
    trainingFlagKeys: [
      "allow_public_corpus_metadata_fetch",
      "allow_public_corpus_bounded_download",
      "allow_public_corpus_cleaning",
      "allow_tokenizer_training",
      "allow_engineering_training",
      "allow_decoder_training",
      "allow_phase_4_scaled_training",
      "allow_product_model_training",
      "allow_long_term_training",
      "allow_weight_commit"
    ]
  },
  {
    id: "r27a4_long_run_training_campaign_v1",
    path: "training/from_scratch/APPROVE_R27A4_LONG_RUN_TRAINING_CAMPAIGN_V1.json",
    expectedScope: "long_run_engineering_campaign_only",
    expectedPhase: "phase_3_engineering_model_lab",
    expectedRunId: "r27a4_long_run_training_campaign_v1",
    consumedByCommit: "pending_r27a4_commit",
    optionalUntilCreated: true,
    trainingFlagKeys: [
      "allow_public_corpus_metadata_fetch",
      "allow_public_corpus_bounded_download",
      "allow_public_corpus_cleaning",
      "allow_tokenizer_training",
      "allow_engineering_training",
      "allow_decoder_training",
      "allow_campaign_resume",
      "allow_hyperparameter_sweep",
      "allow_phase_4_scaled_training",
      "allow_product_model_training",
      "allow_long_term_training",
      "allow_weight_commit"
    ]
  }
];

const SECRET_RE = /(?:BEGIN PRIVATE KEY|api[_-]?key|secret[_-]?(?:key)?|password|access[_-]?token|auth[_-]?token|bearer\s+[A-Za-z0-9._-]{12,}|\/Users\/[^/\s]+|[A-Za-z]:\\Users\\)/i;

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
}

function markerAllowsTraining(marker, spec) {
  if (!marker?.approved || marker.consumed === true) return false;
  if (spec.template || spec.path.endsWith(".template.json")) return false;
  if (spec.id === "r25k_toy_overfit") return marker.scope === spec.expectedScope;
  return spec.trainingFlagKeys.some((key) => marker[key] === true);
}

function markerSummary(spec, marker, failures) {
  return {
    id: spec.id,
    path: spec.path,
    approved: marker?.approved === true,
    consumed: marker?.consumed === true,
    allow_additional_runs: marker?.allow_additional_runs === true,
    template: spec.template === true,
    active_training_approval: markerAllowsTraining(marker, spec),
    active_tokenizer_dry_run_approval: marker?.consumed !== true && marker?.allow_tokenizer_dry_run === true,
    active_corpus_generation_approval: marker?.consumed !== true && marker?.approved === true && marker?.allow_candidate_generation === true,
    active_product_training_approval: marker?.consumed !== true && marker?.allow_product_model_training === true,
    active_promotion_approval: marker?.consumed !== true && marker?.allow_promote_derived_rows === true,
    active_weight_commit_approval: marker?.consumed !== true && marker?.allow_weight_commit === true,
    active_phase4_training_approval: marker?.consumed !== true && marker?.allow_phase_4_scaled_training === true,
    consumed_by_commit: marker?.consumed_by_commit || null,
    failures: failures.filter((failure) => failure.marker === spec.id)
  };
}

async function main() {
  const failures = [];
  const summaries = [];
  let activeTraining = 0;
  let activeTokenizerDryRun = 0;
  let activeCorpusGeneration = 0;
  let activeProductTraining = 0;
  let activePromotion = 0;
  let activeWeightCommit = 0;
  let activePhase4Training = 0;

  for (const spec of MARKERS) {
    const marker = await readJson(spec.path).catch((error) => {
      if (spec.optionalUntilCreated && error?.code === "ENOENT") return null;
      failures.push({ marker: spec.id, code: "approval_marker_missing_or_invalid_json", path: spec.path, detail: error.message });
      return null;
    });
    if (!marker) {
      summaries.push(markerSummary(spec, marker, failures));
      continue;
    }

    if (marker.scope !== spec.expectedScope) failures.push({ marker: spec.id, code: "scope_mismatch", expected: spec.expectedScope, actual: marker.scope });
    if (marker.phase !== spec.expectedPhase) failures.push({ marker: spec.id, code: "phase_mismatch", expected: spec.expectedPhase, actual: marker.phase });
    if (spec.expectedRunId && marker.run_id !== spec.expectedRunId) failures.push({ marker: spec.id, code: "run_id_mismatch", expected: spec.expectedRunId, actual: marker.run_id });
    if (spec.expectedVariantId && marker.variant_id !== spec.expectedVariantId) failures.push({ marker: spec.id, code: "variant_id_mismatch", expected: spec.expectedVariantId, actual: marker.variant_id });
    if (spec.template) {
      if (marker.approved !== false) failures.push({ marker: spec.id, code: "template_must_not_be_approved" });
      for (const key of spec.trainingFlagKeys) {
        if (marker[key] !== false) failures.push({ marker: spec.id, code: "template_training_flag_must_be_false", key });
      }
      if (marker.reviewer !== "") failures.push({ marker: spec.id, code: "template_reviewer_must_be_blank" });
      if (!spec.path.endsWith(".template.json")) failures.push({ marker: spec.id, code: "template_path_must_end_template_json" });
    } else {
      if (marker.consumed !== true) failures.push({ marker: spec.id, code: "approval_marker_not_consumed" });
      if (marker.allow_additional_runs !== false) failures.push({ marker: spec.id, code: "allow_additional_runs_must_be_false" });
      if (marker.consumed_by_commit !== spec.consumedByCommit) {
        failures.push({ marker: spec.id, code: "consumed_by_commit_mismatch", expected: spec.consumedByCommit, actual: marker.consumed_by_commit });
      }
      if (!String(marker.consumed_reason || "").includes("future runs require a new approval marker")) {
        failures.push({ marker: spec.id, code: "consumed_reason_missing_new_marker_requirement" });
      }
    }
    if (marker.allow_weight_commit !== false) failures.push({ marker: spec.id, code: "allow_weight_commit_must_be_false" });
    if (marker.allow_long_term_training !== false) failures.push({ marker: spec.id, code: "allow_long_term_training_must_be_false" });
    if (marker.allow_product_model_training !== false) failures.push({ marker: spec.id, code: "allow_product_model_training_must_be_false" });
    if (marker.allow_data_refinement_training === true) failures.push({ marker: spec.id, code: "allow_data_refinement_training_must_not_be_true" });
    if (marker.allow_data_regularization_training === true && marker.consumed !== true) failures.push({ marker: spec.id, code: "allow_data_regularization_training_must_not_be_true" });
    if (marker.allow_phase_4_scaled_training === true) failures.push({ marker: spec.id, code: "allow_phase_4_scaled_training_must_not_be_true" });
    if (marker.allow_tokenizer_dry_run === true && marker.consumed !== true) failures.push({ marker: spec.id, code: "allow_tokenizer_dry_run_must_not_be_true_when_active" });
    if (marker.allow_release_checkpoint === true) failures.push({ marker: spec.id, code: "allow_release_checkpoint_must_not_be_true" });
    if (SECRET_RE.test(JSON.stringify(marker))) failures.push({ marker: spec.id, code: "private_path_or_secret_marker_present" });

    const trainingActive = markerAllowsTraining(marker, spec);
    const tokenizerActive = marker.consumed !== true && marker.allow_tokenizer_dry_run === true;
    const corpusGenerationActive = marker.consumed !== true && marker.approved === true && marker.allow_candidate_generation === true;
    const productActive = marker.consumed !== true && marker.allow_product_model_training === true;
    const promotionActive = marker.consumed !== true && marker.allow_promote_derived_rows === true;
    const weightActive = marker.consumed !== true && marker.allow_weight_commit === true;
    const phase4Active = marker.consumed !== true && marker.allow_phase_4_scaled_training === true;
    if (trainingActive) activeTraining += 1;
    if (tokenizerActive) activeTokenizerDryRun += 1;
    if (corpusGenerationActive) activeCorpusGeneration += 1;
    if (productActive) activeProductTraining += 1;
    if (promotionActive) activePromotion += 1;
    if (weightActive) activeWeightCommit += 1;
    if (phase4Active) activePhase4Training += 1;
    summaries.push(markerSummary(spec, marker, failures));
  }

  if (activeTraining !== 0) failures.push({ code: "active_training_approval_count_must_be_zero", activeTraining });
  if (activeTokenizerDryRun !== 0) failures.push({ code: "active_tokenizer_dry_run_approval_count_must_be_zero", activeTokenizerDryRun });
  if (activeCorpusGeneration !== 0) failures.push({ code: "active_corpus_generation_approval_count_must_be_zero", activeCorpusGeneration });
  if (activeProductTraining !== 0) failures.push({ code: "active_product_training_approval_count_must_be_zero", activeProductTraining });
  if (activePromotion !== 0) failures.push({ code: "active_promotion_approval_count_must_be_zero", activePromotion });
  if (activeWeightCommit !== 0) failures.push({ code: "active_weight_commit_approval_count_must_be_zero", activeWeightCommit });
  if (activePhase4Training !== 0) failures.push({ code: "active_phase4_training_approval_count_must_be_zero", activePhase4Training });

  const report = {
    ok: failures.length === 0,
    markers: summaries,
    active_training_approval_count: activeTraining,
    active_tokenizer_dry_run_approval_count: activeTokenizerDryRun,
    active_corpus_generation_approval_count: activeCorpusGeneration,
    active_product_training_approval_count: activeProductTraining,
    active_promotion_approval_count: activePromotion,
    active_weight_commit_approval_count: activeWeightCommit,
    active_phase4_training_approval_count: activePhase4Training,
    failures
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
