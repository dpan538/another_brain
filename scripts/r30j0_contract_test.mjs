#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  CONFIDENCE_LABELS,
  J0_TRAINING_STATE,
  JUDGE_CONTEXT_CONTRACT,
  PERSONAL_FIT_LABELS,
  PRESENTATION_LABELS,
  PROFILE_REPRESENTATION_CANDIDATES,
  VOICE_ISSUE_LABELS,
  judgeInputBudget,
  presentationDecision,
} from "../src/personal_judge/personal_judge_contract.ts";
import { compileJudgeInput } from "../src/personal_judge/judge_input_contract.ts";
import { validateControlledMutation } from "../src/personal_judge/mutation_contract.ts";
import {
  END_USER_ADAPTATION_BOUNDARY,
  PERSONAL_JUDGE_DATA_POLICY,
  PORTFOLIO_KNOWLEDGE_BOUNDARY,
  validatePublicSafeProfile,
} from "../src/personal_judge/privacy_contract.ts";

const ROOT = resolve(import.meta.dirname, "..");
const TEST = process.argv[2];
const json = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const text = (path) => readFileSync(join(ROOT, path), "utf8");
const architecture = () => json("config/r30j0_personal_judge_architecture_v1.json");
const charter = () => json("data/personal_judge/efish_personal_preference_charter_v1.json");
const profile = () => json("data/personal_judge/efish_personal_style_profile_v1.template.json");
const dataset = () => json("config/r30j0_dataset_design_v1.json");

function architectureReport() {
  const completed = spawnSync("python3", ["scripts/r30j0_measure_architecture.py", "--compact"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.equal(completed.status, 0, completed.stderr);
  return JSON.parse(completed.stdout);
}

const tests = {
  test_judge_context_512() {
    assert.deepEqual(JUDGE_CONTEXT_CONTRACT, {
      hard_max_tokens: 512, normal_target_tokens: 448, reserved_tokens: 64,
      overlength_decision: "DEFAULT_PRESENTATION", semantic_truncation_allowed: false,
    });
    assert.equal(judgeInputBudget(512).accepted, true);
    assert.deepEqual(judgeInputBudget(513), {
      accepted: false, decision: "DEFAULT_PRESENTATION", semantic_truncation_performed: false, total_tokens: 513,
    });
    const sections = { profile_tokens: ["<STYLE_COMPACT>"], recent_context: [], latest_user_message: "说短一点。", deepseek_answer: "可以。" };
    const over = compileJudgeInput(sections, () => Array.from({ length: 513 }, (_, index) => index));
    assert.equal(over.serialized, null);
    assert.equal(over.semantic_truncation_performed, false);
  },
  test_no_lm_generation_head_contract() {
    const runtime = architecture().runtime_contract;
    assert.equal(runtime.classification_only, true);
    assert.equal(runtime.lm_head, "absent");
    assert.equal(runtime.autoregressive_decode, false);
    assert.equal(runtime.greedy_decode, false);
    assert.equal(runtime.sampling, false);
    assert.equal(runtime.kv_cache_required, false);
  },
  test_parameter_budget() {
    const report = architectureReport();
    assert.equal(report.source_decoder_parameters_excluding_masks, 96421248);
    assert.equal(report.judge_common_parameters_excluding_profile_representation, 82337946);
    assert.equal(report.lm_head_parameters_removed, 14336000);
    assert.equal(report.position_parameters_added, 229376);
    assert.equal(report.classification_head_parameters_added, 23322);
    assert.ok(report.judge_common_parameters_excluding_profile_representation >= 80_000_000);
    assert.ok(report.judge_common_parameters_excluding_profile_representation <= 85_000_000);
    assert.ok(report.storage_projection.all_q4.weight_bytes <= 45_000_000);
    assert.equal(report.measurement_kind, "synthetic_architecture_projection_not_browser_benchmark");
  },
  test_profile_schema() {
    const schema = json("schemas/efish_personal_style_profile_v1.schema.json");
    assert.equal(schema.title, "EfishPersonalStyleProfileV1");
    assert.equal(schema.additionalProperties, false);
    assert.equal(profile().status, "owner_review_required");
    assert.ok(Object.values(profile().axes).every((value) => value === null));
  },
  test_profile_no_sensitive_fields() {
    assert.deepEqual(validatePublicSafeProfile(profile()).forbidden_keys, []);
    assert.equal(validatePublicSafeProfile({ diagnosis: "x" }).valid, false);
    assert.equal(charter().privacy_boundary.end_user_profiling, false);
  },
  test_owner_review_required() {
    assert.equal(charter().owner_review_completed, false);
    assert.equal(profile().owner_review_completed, false);
    const pack = json("data/personal_judge/templates/r30j0_owner_review_pack_template_v1.json");
    assert.equal(pack.owner_review_completed, false);
    assert.equal(pack.validated_export, false);
  },
  test_personal_fit_taxonomy() {
    assert.deepEqual([...PERSONAL_FIT_LABELS], charter().judge_head_taxonomies.personal_fit);
  },
  test_voice_issue_taxonomy() {
    assert.deepEqual([...VOICE_ISSUE_LABELS], charter().judge_head_taxonomies.voice_issues);
  },
  test_presentation_taxonomy() {
    assert.deepEqual([...PRESENTATION_LABELS], charter().judge_head_taxonomies.presentation_mode);
    assert.deepEqual([...CONFIDENCE_LABELS], charter().judge_head_taxonomies.confidence_abstention);
  },
  test_mutation_fact_preservation() {
    const source = "如果项目在2026年8月23日前支付20元，结论是“可以继续”";
    const safe = "简要说：如果项目在2026年8月23日前支付20元，结论是“可以继续”";
    assert.equal(validateControlledMutation(source, safe).accepted, true);
    assert.equal(validateControlledMutation(source, safe.replace("20元", "30元")).accepted, false);
    assert.equal(validateControlledMutation(source, safe.replace("如果", "")).accepted, false);
    assert.equal(validateControlledMutation(source, safe.replace("可以继续", "不可以继续")).accepted, false);
    assert.equal(validateControlledMutation("方案叫蓝桥。", "方案叫红桥。", { namedValues: ["蓝桥"] }).accepted, false);
  },
  test_generic_good_personal_mismatch() {
    assert.equal(dataset().contrast_pair_contract.must_include_generic_good_personal_mismatch, true);
    assert.ok(dataset().pilot.mix_hypothesis.some((row) => row.category === "generic_good_but_efish_mismatch" && row.pilot_count === 100));
  },
  test_personal_not_equal_shorter() {
    assert.ok(dataset().pilot.required_reverse_controls.includes("shorter_answer_is_too_cryptic"));
    assert.ok(json("config/r30j0_generic_baseline_v1.json").evaluation.shortcut_slices.includes("shorter_is_not_always_preferred"));
  },
  test_personal_not_equal_casual() {
    assert.ok(dataset().pilot.required_reverse_controls.includes("casual_answer_is_not_preferred"));
    assert.ok(json("config/r30j0_generic_baseline_v1.json").evaluation.shortcut_slices.includes("casual_is_not_always_preferred"));
  },
  test_no_emotion_diagnosis() {
    assert.ok(dataset().not_a_target.includes("end_user_emotion_diagnosis"));
    assert.ok(charter().authority_boundary.efish_judge_must_not.includes("diagnose_end_user_emotion"));
  },
  test_no_private_raw_chat_source() {
    assert.ok(dataset().forbidden_source_kinds.includes("raw_private_chat_export"));
    const schema = json("schemas/efish_personal_judge_example_v1.schema.json");
    assert.ok(!schema.properties.source_kind.enum.includes("raw_private_chat_export"));
    assert.equal(PERSONAL_JUDGE_DATA_POLICY.private_raw_chat_source_allowed, false);
  },
  test_no_online_learning() {
    assert.equal(PERSONAL_JUDGE_DATA_POLICY.background_online_learning, false);
    assert.equal(PERSONAL_JUDGE_DATA_POLICY.automatic_live_user_collection, false);
  },
  test_no_rag() {
    assert.equal(PORTFOLIO_KNOWLEDGE_BOUNDARY.implemented_in_r30j0, false);
    assert.equal(PORTFOLIO_KNOWLEDGE_BOUNDARY.ordinary_dialogue_integration, false);
  },
  test_structured_memory_separate() {
    assert.equal(END_USER_ADAPTATION_BOUNDARY.implemented_in_r30j0, false);
    assert.equal(END_USER_ADAPTATION_BOUNDARY.vector_database_allowed, false);
    assert.equal(END_USER_ADAPTATION_BOUNDARY.hidden_long_term_embeddings_allowed, false);
  },
  test_r28m1_lineage_honesty() {
    assert.equal(architecture().source_decoder.r28m1_role, "default_first_lineage_for_future_probe");
    assert.equal(architecture().attention_variants.bidirectional_judge.r28m1_parity, false);
    assert.equal(architecture().attention_variants.bidirectional_judge.lineage_label_if_initialized_from_r28m1, "warm-started_from_r28m1_representation");
  },
  test_r3_challenger_only() {
    assert.match(architecture().source_decoder.r3_role, /^challenger_only_/u);
    assert.deepEqual(architecture().future_probe_contract.backbone_comparison, ["R28M1_q4_recovered", "R3_stage_a_080k"]);
  },
  test_no_training_in_j0() {
    assert.deepEqual(J0_TRAINING_STATE, { training_started: false, classification_updates: 0, examples_seen_by_optimizer: 0, checkpoint: null, candidate: null });
    assert.equal(dataset().j0_execution.training_started, false);
    assert.equal(dataset().j0_execution.full_dataset_generated, false);
    assert.equal(dataset().future_full_target.authorized, false);
  },
  test_profile_representation_not_selected() {
    const alternatives = architecture().profile_representation_alternatives;
    assert.deepEqual(Object.keys(alternatives), [...PROFILE_REPRESENTATION_CANDIDATES]);
    assert.ok(Object.values(alternatives).every((value) => value.selection_status === "not_selected_j0"));
  },
  test_causal_bidirectional_probe_only() {
    const variants = architecture().attention_variants;
    assert.deepEqual(Object.keys(variants), ["causal_judge", "bidirectional_judge"]);
    assert.equal(variants.causal_judge.future_probe_status, "not_run");
    assert.equal(variants.bidirectional_judge.future_probe_status, "not_run");
    assert.equal(architectureReport().attention_variants.causal_judge.parameter_count, architectureReport().attention_variants.bidirectional_judge.parameter_count);
  },
  test_presentation_never_edits_answer() {
    const original = "答案保持不变。";
    for (const mode of PRESENTATION_LABELS) {
      const result = presentationDecision(original, mode);
      assert.equal(result.answer_text, original);
      assert.equal(result.answer_text_modified, false);
    }
  },
  test_owner_review_pack_capacity() {
    const pack = json("data/personal_judge/templates/r30j0_owner_review_pack_template_v1.json");
    assert.equal(pack.pilot_slot_count, 200);
    assert.equal(pack.contrast_slot_count, 100);
    assert.equal(pack.slot_content_status, "awaiting_public_safe_content");
    assert.equal(pack.allowed_for_training, false);
  },
  test_oracle_presentation_text_unchanged() {
    const oracle = json("config/r30j0_oracle_experiments_v1.json");
    assert.equal(oracle.presentation_upper_bound.answer_text_must_be_byte_identical, true);
    assert.equal(oracle.presentation_upper_bound.semantic_text_editing_allowed, false);
    assert.equal(oracle.oracle_is_actual_efish_model, false);
  },
  test_generic_baseline_has_no_owner_profile() {
    const baseline = json("config/r30j0_generic_baseline_v1.json");
    assert.equal(baseline.owner_profile_access, false);
    assert.equal(baseline.input.owner_profile, false);
    assert.equal(baseline.personal_fit_claim_allowed, false);
  },
  test_no_full_dataset_generated() {
    assert.equal(dataset().pilot.designed_example_count, 400);
    assert.equal(dataset().pilot.generated_example_count_j0, 0);
    assert.equal(dataset().j0_execution.api_requests, 0);
  },
  test_model_card_honest_role() {
    const card = text("docs/models/efish-personal-judge-v1.md");
    assert.match(card, /does not generate the product's factual answer/u);
    assert.match(card, /does not diagnose an end user's emotion or personality/u);
    assert.match(card, /Training has not started/u);
  },
  test_secret_redaction() {
    const scanner = text("scripts/r30j0_secret_scan.py");
    assert.match(scanner, /key_value_logged/u);
    assert.ok(!/print\(\s*(?:key|SECRET_PATH)\b/u.test(scanner));
  },
  test_no_production_change() {
    const result = spawnSync("node", ["scripts/r30j0_no_production_change_gate.mjs"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).production_surface_diff_count, 0);
  },
};

if (!(TEST in tests)) throw new Error(`unknown_r30j0_contract_test:${TEST}`);
await tests[TEST]();
console.log(JSON.stringify({ test: TEST, passed: true }));
