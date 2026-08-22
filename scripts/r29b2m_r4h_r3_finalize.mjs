#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = resolve(ROOT, process.argv[2] || "artifacts/r29b2m_r4h_r3");
const REPORTS = join(ARTIFACT_ROOT, "reports");
const RAW = join(ARTIFACT_ROOT, "raw");
const REVIEWS = join(ARTIFACT_ROOT, "reviews");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function percentile(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))];
}

function relativeNonregression(reviews, armMap, treatmentArm) {
  let regressions = 0;
  let absolutePass = 0;
  for (const review of reviews) {
    const map = armMap.find((row) => row.pair_id === review.pair_id);
    if (!map) throw new Error(`causal_arm_map_missing:${review.pair_id}`);
    const hybridSide = map.response_A === treatmentArm ? "A" : map.response_B === treatmentArm ? "B" : null;
    if (!hybridSide) throw new Error(`causal_treatment_missing:${review.pair_id}`);
    const controlSide = hybridSide === "A" ? "B" : "A";
    if (review.factual_relevance_preference === controlSide) regressions += 1;
    if ((hybridSide === "A" ? review.response_A : review.response_B).factual_relevance_pass) absolutePass += 1;
  }
  return {
    relative_nonregression_count: reviews.length - regressions,
    relative_nonregression_rate: (reviews.length - regressions) / reviews.length,
    relative_regression_count: regressions,
    absolute_factual_relevance_pass_count: absolutePass,
    absolute_factual_relevance_pass_rate: absolutePass / reviews.length,
  };
}

const oldTerminal = await json(join(ROOT, "artifacts/r29b2m_r4h_r2/reports/final_terminal.json"));
if (oldTerminal.terminal !== "BLOCKED_HYBRID_V2_FACTUAL") throw new Error("old_r4h_r2_terminal_changed");
const configAudit = await json(join(ROOT, "reports/r3_request_config_audit.json"));
const provider = await json(join(REPORTS, "provider_variance_review.json"));
const oneCall = await json(join(REPORTS, "one_call_diagnostic_decision.json"));
const oneCallReviews = await json(join(REVIEWS, "one_call_diagnostic_blind_review.json"));
const oneCallMap = await json(join(RAW, "one_call_diagnostic_arm_map.json"));
const twoStage = await json(join(REPORTS, "two_stage_value_decision.json"));
const twoStageCompletion = await json(join(REPORTS, "two_stage_completion.json"));
const twoStageReviews = await json(join(REVIEWS, "two_stage_blind_review.json"));
const twoStageMap = await json(join(RAW, "two_stage_arm_map.json"));
const causalAudit = await json(join(REVIEWS, "two_stage_causal_guard_audit.json"));
const guardReplay = await json(join(REPORTS, "semantic_guard_replay.json"));
const liveState = await json(join(ARTIFACT_ROOT, "live_state.json"));
const secret = await json(join(REPORTS, "secret_scan.json"));
const tests = await json(join(REPORTS, "final_validation.json"));
const records = await json(join(RAW, "live_records.json"));
const chains = await json(join(RAW, "two_stage_chains.json"));

const oneCallCausal = relativeNonregression(oneCallReviews.reviews, oneCallMap, "v2_anchors_style");
const causalRows = causalAudit.reviews;
if (causalRows.length !== 24 || new Set(causalRows.map((row) => row.case_id)).size !== 24) throw new Error("causal_guard_audit_not_24");
const twoStageCausal = {
  relative_nonregression_count: causalRows.filter((row) => !row.factual_relevance_regression_vs_canonical).length,
  relative_nonregression_rate: causalRows.filter((row) => !row.factual_relevance_regression_vs_canonical).length / causalRows.length,
  relative_regression_count: causalRows.filter((row) => row.factual_relevance_regression_vs_canonical).length,
  accepted_rewrite_new_unsupported_facts: causalRows.filter((row) => row.initial_guard_accepted).reduce((sum, row) => sum + row.new_unsupported_facts_vs_canonical, 0),
  semantic_guard_false_negative_critical_cases: causalRows.filter((row) => row.initial_guard_accepted && row.critical_regression_vs_canonical).length,
  semantic_guard_false_negative_noncritical_cases: causalRows.filter((row) => row.initial_guard_accepted && row.factual_relevance_regression_vs_canonical && !row.critical_regression_vs_canonical).length,
  absolute_accepted_final_unsupported_facts: twoStage.unsupported_facts,
  conservative_absolute_quality_nonregression_rate: twoStage.factual_relevance_nonregression,
};

const call1 = records.filter((row) => row.phase === "two_stage_canonical").map((row) => row.completion_latency_ms);
const call2 = records.filter((row) => row.phase === "two_stage_rewrite").map((row) => row.completion_latency_ms);
const guardLatency = chains.map((row) => row.semantic_guard.guard_latency_ms);
const criticLatency = chains.map((row) => row.critic_latency_ms);
const remainingCriticP95 = 5_000 - percentile(call1, 0.95) - percentile(call2, 0.95) - percentile(guardLatency, 0.95);
const latency = {
  final_answer_ready_p50_ms: twoStage.final_answer_ready_p50_ms,
  final_answer_ready_p95_ms: twoStage.final_answer_ready_p95_ms,
  final_answer_ready_max_ms: twoStage.final_answer_ready_max_ms,
  call1_completion_p95_ms: percentile(call1, 0.95),
  call2_completion_p95_ms: percentile(call2, 0.95),
  oracle_critic_p95_ms: percentile(criticLatency, 0.95),
  semantic_guard_p95_ms: percentile(guardLatency, 0.95),
  measured_remaining_future_critic_budget_p95_ms: remainingCriticP95,
  recommended_future_critic_p50_ms: Math.min(250, remainingCriticP95 / 2),
  recommended_future_critic_p95_ms: Math.min(500, remainingCriticP95),
  future_critic_hard_ceiling_ms: remainingCriticP95,
};

const twoStageCausalFailures = [
  twoStageCausal.accepted_rewrite_new_unsupported_facts !== 0 ? "accepted_rewrite_new_unsupported_facts" : null,
  twoStageCausal.semantic_guard_false_negative_critical_cases !== 0 ? "semantic_guard_false_negative_critical_cases" : null,
  twoStageCausal.relative_nonregression_rate < 1 ? "factual_relevance_nonregression" : null,
  twoStage.critical_regressions !== 0 ? "critical_regressions" : null,
  twoStage.overall_preference < 0.60 ? "overall_preference" : null,
  twoStage.brand_preference < 0.65 ? "brand_preference" : null,
  twoStage.natural_voice_preference < 0.65 ? "natural_voice_preference" : null,
  twoStage.customer_service_tone_reduction < 0.30 ? "customer_service_tone_reduction" : null,
  twoStage.over_explanation_reduction < 0.25 ? "over_explanation_reduction" : null,
  twoStage.safe_rewrite_accept_rate < 0.40 ? "safe_rewrite_accept_rate" : null,
  latency.final_answer_ready_p50_ms > 3_000 ? "final_answer_ready_p50" : null,
  latency.final_answer_ready_p95_ms > 5_000 ? "final_answer_ready_p95" : null,
  latency.final_answer_ready_max_ms > 8_000 ? "final_answer_ready_hard_ceiling" : null,
].filter(Boolean);

if (liveState.live_request_count !== 120 || liveState.live_request_count > 200 || liveState.estimated_cost_cny_conservative_upper_bound > 2) throw new Error("live_budget_violation");
if (!secret.pass || !tests.all_passed || !configAudit.pass) throw new Error("final_validation_prerequisite_failed");
const terminal = "BLOCKED_HYBRID_ARCHITECTURE";
const summary = {
  campaign_id: "r29b2m_r4h_r3_controlled_critic_hybrid_v1",
  terminal,
  old_R4H_R2_terminal: oldTerminal.terminal,
  old_R4H_R2_terminal_modified: false,
  previous_evidence: {
    v1: { overall_preference: 0.50, brand_preference: 0.60, factual_relevance_nonregression: 0.80, unsupported_facts: 3, measurable_influence: 0.967, substantive_influence: 0.667 },
    v2: { overall_preference: 0.333, brand_preference: 0.233, factual_relevance_nonregression: 0.667, unsupported_facts: 4, measurable_influence: 0.967, substantive_influence: 0.767 },
  },
  request_config_audit: configAudit,
  provider_variance: provider,
  one_call_diagnostic: { ...oneCall, causal_relative: oneCallCausal, expansion_run: false },
  two_stage_live: { ...twoStage, causal_relative: twoStageCausal, guard_replay_counterfactual: guardReplay },
  two_stage_failed_gates_at_causal_contract: twoStageCausalFailures,
  latency,
  live_usage: {
    requests: liveState.live_request_count,
    input_tokens: liveState.input_tokens,
    output_tokens: liveState.output_tokens,
    cache_hit_tokens: liveState.cache_hit_tokens,
    cache_miss_tokens: liveState.cache_miss_tokens,
    estimated_cost_usd: liveState.estimated_cost_usd,
    estimated_cost_cny_conservative_upper_bound: liveState.estimated_cost_cny_conservative_upper_bound,
  },
  critic_execution_rate: twoStageCompletion.critic_execution_rate,
  rewrite_attempt_rate: twoStageCompletion.rewrite_attempt_rate,
  initial_safe_rewrite_accept_rate: twoStageCompletion.safe_rewrite_accept_rate,
  initial_canonical_fallback_rate: twoStageCompletion.canonical_fallback_rate,
  guard_replay_safe_rewrite_accept_rate_unreviewed: guardReplay.replay_safe_rewrite_accept_rate,
  guard_replay_canonical_fallback_rate_unreviewed: guardReplay.replay_canonical_fallback_rate,
  actual_efish_critic_model_trained: false,
  oracle_critic: true,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  training_authorized: false,
  future_local_model_outputs_authorized: [],
  bounded_candidate_outputs_if_a_future_architecture_passes: ["style_classification", "style_issue_multi_label_classification", "optional_exact_preferred_span_selection"],
  no_product_deployment: true,
  no_production_route: true,
  no_production_ui_modification: true,
  unvalidated_stream_exposed: false,
  secret_scan_passed: secret.pass,
  all_tests_passed: tests.all_passed,
};
await atomicJson(join(REPORTS, "controlled_causal_summary.json"), summary);
await atomicJson(join(REPORTS, "final_terminal.json"), {
  campaign: "R29B2M-R4H-R3",
  terminal,
  training_authorized: false,
  failed_gates: twoStageCausalFailures,
  old_R4H_R2_terminal: oldTerminal.terminal,
  old_R4H_R2_terminal_modified: false,
  live_request_count: liveState.live_request_count,
  secret_scan_passed: secret.pass,
  all_tests_passed: tests.all_passed,
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  actual_efish_critic_model_trained: false,
  oracle_critic: true,
  production_modified: false,
});
await atomicJson(join(ARTIFACT_ROOT, "campaign_state.json"), {
  campaign_id: "r29b2m_r4h_r3_controlled_critic_hybrid_v1",
  state: terminal,
  terminal: true,
  history: ["ORIENTATION", "EVIDENCE_ADOPTION", "REQUEST_CONFIG_AUDIT", "CONTROLLED_BASELINE", "ONE_CALL_CAUSAL_REPLAY", "ONE_CALL_DECISION", "CANONICAL_DRAFT_CHAIN", "CRITIC_PACKET", "CONSTRAINED_REWRITE", "SEMANTIC_GUARD", "TWO_STAGE_LIVE_EVAL", "LATENCY_ANALYSIS", "VALUE_ANALYSIS", "ARCHITECTURE_DECISION", "NEXT_MODEL_CONTRACT", "FINAL_VALIDATION", terminal],
  training_started: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
});
console.log(JSON.stringify({ terminal, live_requests: liveState.live_request_count, one_call_passed: false, two_stage_passed: false, training_authorized: false, failed_gates: twoStageCausalFailures }));
