#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decideHybridV2Terminal } from "../src/hybrid_runtime/hybrid_v2_quality_gate.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_ROOT = join(ROOT, "artifacts/r29b2m_r4h_r2");
const REPORT_ROOT = join(ARTIFACT_ROOT, "reports");
const RAW_ROOT = join(ARTIFACT_ROOT, "raw");
const PAIRED_CASES = 30;
const PROXY_BROWSER_SAFETY_MARGIN_MS = 750;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const round = (value, digits = 10) => Number(value.toFixed(digits));
const rate = (count) => count / PAIRED_CASES;
const percentile = (values, quantile) => {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1))];
};
const summary = (values) => ({
  p50: percentile(values, 0.50),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
  sample_count: values.length,
});
const reduction = (baseline, candidate) => baseline === 0 ? (candidate === 0 ? 1 : -candidate) : (baseline - candidate) / baseline;
const atomicJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
};

const blind = await readJson(join(REPORT_ROOT, "blind_quality_review.json"));
const armMap = await readJson(join(RAW_ROOT, "arm_map.json"));
const blindPairs = await readJson(join(RAW_ROOT, "blind_pairs.json"));
const records = await readJson(join(RAW_ROOT, "live_records.json"));
const valueAnalysis = await readJson(join(REPORT_ROOT, "style_anchor_value_analysis.json"));
const secretScan = await readJson(join(REPORT_ROOT, "secret_scan.json"));
const supervisor = await readJson(join(ARTIFACT_ROOT, "supervisor_state.json"));
const postLiveGates = await readJson(join(REPORT_ROOT, "post_live_gates.json"));
const oldTerminal = await readJson(join(ROOT, "artifacts/r29b2m_r4h_r1/reports/final_terminal.json"));

assert.equal(blind.reviewer_class, "codex_agent_packet_v2_review_not_human");
assert.equal(blind.arm_identity_visible_during_review, false);
assert.equal(blind.review_completed_before_arm_map_read, true);
assert.equal(blind.reviews.length, PAIRED_CASES);
assert.equal(armMap.length, PAIRED_CASES);
assert.equal(blindPairs.length, PAIRED_CASES);
assert.equal(valueAnalysis.cases.length, PAIRED_CASES);
assert.equal(supervisor.live_request_count, 66);
assert.equal(supervisor.field_ablation_requests, 0);
assert.equal(supervisor.old_R4H_R1_terminal, "BLOCKED_HYBRID_VALUE");
assert.equal(supervisor.old_R4H_R1_terminal_modified, false);
assert.equal(oldTerminal.terminal, "BLOCKED_HYBRID_VALUE");
assert.equal(secretScan.pass, true);
assert.equal(postLiveGates.all_tests_pass, true);
assert.equal(postLiveGates.no_production_modifications, true);
assert.equal(postLiveGates.no_signal_training, true);
assert.equal(postLiveGates.no_weight_modifications, true);

const maps = new Map(armMap.map((row) => [row.pair_id, row]));
const pairs = new Map(blindPairs.map((row) => [row.pair_id, row]));
let hybridWins = 0;
let deepseekWins = 0;
let ties = 0;
let brandWins = 0;
let brandTies = 0;
let naturalWins = 0;
let naturalLosses = 0;
let naturalTies = 0;
let factualNonregression = 0;
let unsupportedFacts = 0;
let therapyCritical = 0;
let privacyCritical = 0;
let identityCritical = 0;
let deepseekCustomerService = 0;
let hybridCustomerService = 0;
let deepseekOverExplanation = 0;
let hybridOverExplanation = 0;
let hybridTotal = 0;
let deepseekTotal = 0;

const hasAny = (flags, candidates) => candidates.some((flag) => flags.includes(flag));
for (const review of blind.reviews) {
  const mapping = maps.get(review.pair_id);
  const pair = pairs.get(review.pair_id);
  assert.ok(mapping && pair);
  const hybridLetter = mapping.response_A === "hybrid_v2" ? "A" : "B";
  const deepseekLetter = hybridLetter === "A" ? "B" : "A";
  const hybridScores = review[`scores_${hybridLetter}`];
  const deepseekScores = review[`scores_${deepseekLetter}`];
  const hybridFlags = review[`flags_${hybridLetter}`];
  const deepseekFlags = review[`flags_${deepseekLetter}`];
  assert.equal(hybridScores.length, blind.score_order.length);
  if (review.preferred === "tie") ties += 1;
  else if (review.preferred === hybridLetter) hybridWins += 1;
  else deepseekWins += 1;
  if (hybridScores[3] > deepseekScores[3]) brandWins += 1;
  else if (hybridScores[3] === deepseekScores[3]) brandTies += 1;
  if (hybridScores[2] > deepseekScores[2]) naturalWins += 1;
  else if (hybridScores[2] < deepseekScores[2]) naturalLosses += 1;
  else naturalTies += 1;
  if (hybridScores[0] >= deepseekScores[0] && hybridScores[1] >= deepseekScores[1]) factualNonregression += 1;
  if (hybridFlags.includes("unsupported_fact")) unsupportedFacts += 1;
  if (hasAny(hybridFlags, ["therapy_critical_error", "therapy_tone", "diagnosis"])) therapyCritical += 1;
  if (hasAny(hybridFlags, ["privacy_critical_error", "privacy_leak", "private_data_leak"])) privacyCritical += 1;
  if (hasAny(hybridFlags, ["identity_critical_error", "forbidden_identity", "ontology_leakage"])) identityCritical += 1;
  if (deepseekFlags.includes("customer_service_tone")) deepseekCustomerService += 1;
  if (hybridFlags.includes("customer_service_tone")) hybridCustomerService += 1;
  if (deepseekFlags.includes("over_explanation")) deepseekOverExplanation += 1;
  if (hybridFlags.includes("over_explanation")) hybridOverExplanation += 1;
  hybridTotal += review[`total_${hybridLetter}`];
  deepseekTotal += review[`total_${deepseekLetter}`];
}

const quality = {
  reviewer_class: blind.reviewer_class,
  paired_cases: PAIRED_CASES,
  hybrid_wins: hybridWins,
  deepseek_only_wins: deepseekWins,
  ties,
  overall_hybrid_preference: rate(hybridWins),
  overall_preference_gate: 0.60,
  overall_preference_pass: rate(hybridWins) >= 0.60,
  hybrid_brand_score_wins: brandWins,
  hybrid_brand_score_ties: brandTies,
  brand_voice_preference: rate(brandWins),
  brand_voice_preference_gate: 0.65,
  brand_voice_preference_pass: rate(brandWins) >= 0.65,
  natural_voice_score_wins: naturalWins,
  natural_voice_score_losses: naturalLosses,
  natural_voice_score_ties: naturalTies,
  hybrid_mean_total_score: hybridTotal / PAIRED_CASES,
  deepseek_only_mean_total_score: deepseekTotal / PAIRED_CASES,
  packet_adherence_cases: valueAnalysis.summary.packet_adherent_cases,
  packet_adherence: valueAnalysis.summary.packet_adherence_rate,
  packet_adherence_gate: 0.90,
  packet_adherence_pass: valueAnalysis.summary.packet_adherence_rate >= 0.90,
  factual_relevance_nonregression_cases: factualNonregression,
  factual_relevance_nonregression: rate(factualNonregression),
  factual_relevance_nonregression_gate: 0.98,
  factual_relevance_nonregression_pass: rate(factualNonregression) >= 0.98,
  hybrid_unsupported_fact_flags: unsupportedFacts,
  unsupported_facts_gate: 0,
  unsupported_facts_pass: unsupportedFacts === 0,
  hybrid_therapy_critical_errors: therapyCritical,
  hybrid_privacy_critical_errors: privacyCritical,
  hybrid_identity_critical_errors: identityCritical,
  deepseek_customer_service_tone_flags: deepseekCustomerService,
  hybrid_customer_service_tone_flags: hybridCustomerService,
  customer_service_tone_reduction: reduction(deepseekCustomerService, hybridCustomerService),
  customer_service_tone_reduction_gate: 0.30,
  customer_service_tone_reduction_pass: reduction(deepseekCustomerService, hybridCustomerService) >= 0.30,
  deepseek_over_explanation_flags: deepseekOverExplanation,
  hybrid_over_explanation_flags: hybridOverExplanation,
  over_explanation_reduction: reduction(deepseekOverExplanation, hybridOverExplanation),
  over_explanation_reduction_gate: 0.25,
  over_explanation_reduction_pass: reduction(deepseekOverExplanation, hybridOverExplanation) >= 0.25,
  measurable_local_influence_cases: valueAnalysis.summary.measurable_influence_cases,
  measurable_local_influence: valueAnalysis.summary.measurable_influence_rate,
  measurable_local_influence_gate: 0.60,
  measurable_local_influence_pass: valueAnalysis.summary.measurable_influence_rate >= 0.60,
  substantive_local_influence_cases: valueAnalysis.summary.substantive_influence_cases,
  substantive_local_influence: valueAnalysis.summary.substantive_influence_rate,
  substantive_local_influence_gate: 0.25,
  substantive_local_influence_pass: valueAnalysis.summary.substantive_influence_rate >= 0.25,
  substantive_influence_excludes: ["shorter_output_only", "punctuation_only", "adjective_only", "synonym_only", "sentence_reorder_without_semantic_difference"],
};

const pairedRecords = records.filter((record) => record.phase === "v2_paired_ab");
const deepseekRecords = pairedRecords.filter((record) => record.arm === "deepseek_only");
const hybridRecords = pairedRecords.filter((record) => record.arm === "hybrid_v2");
assert.equal(records.length, 66);
assert.equal(pairedRecords.length, 60);
assert.equal(deepseekRecords.length, PAIRED_CASES);
assert.equal(hybridRecords.length, PAIRED_CASES);
assert.ok(records.every((record) => record.api_success && record.valid_sse && record.tool_call_count === 0 && !record.unexpected_reasoning_content));

const deepseekTtft = summary(deepseekRecords.map((record) => record.deepseek_ttft_ms));
const hybridTtft = summary(hybridRecords.map((record) => record.hybrid_ttft_ms));
const hybridCompletion = summary(hybridRecords.map((record) => record.hybrid_completion_latency_ms));
const signalLatency = summary(hybridRecords.map((record) => record.signal_latency_ms));
const latency = {
  request_count: records.length,
  paired_case_count: PAIRED_CASES,
  deepseek_only_ttft_ms: deepseekTtft,
  oracle_packet_compile_latency_ms: signalLatency,
  hybrid_v2_ttft_ms: hybridTtft,
  hybrid_v2_completion_ms: hybridCompletion,
  ttft_p95_gate_ms: 5_000,
  completion_p95_gate_ms: 8_000,
  latency_pass: deepseekTtft.p95 <= 5_000 && hybridTtft.p95 <= 5_000 && hybridCompletion.p95 <= 8_000,
  actual_efish_signal_model_trained: false,
  oracle_signal_packet_is_simulation: true,
  actual_efish_model_latency_claimed: false,
};

const localHardCeiling = Math.max(0, 5_000 - deepseekTtft.p95 - PROXY_BROWSER_SAFETY_MARGIN_MS);
const recommendedP95 = Math.min(500, Math.floor(localHardCeiling * 0.20));
const recommendedP50 = Math.min(200, Math.floor(recommendedP95 * 0.40));
const localBudget = {
  formula: "5000ms - measured DeepSeek-only TTFT p95 - proxy/browser safety margin",
  measured_deepseek_only_ttft_p95_ms: deepseekTtft.p95,
  proxy_browser_safety_margin_ms: PROXY_BROWSER_SAFETY_MARGIN_MS,
  available_local_budget_p95_ms: round(localHardCeiling, 6),
  recommended_local_signal_p50_ms: recommendedP50,
  recommended_local_signal_p95_ms: recommendedP95,
  hard_ceiling_ms: round(localHardCeiling, 6),
  recommendation_policy: "Use at most 20% of measured headroom for the p95 target, capped at 500ms; set p50 at at most 40% of that target, capped at 200ms.",
  old_800ms_budget_retained: false,
};

const gateMetrics = {
  configuration_pass: supervisor.child_exit_code === 0 && supervisor.configuration_error === null && supervisor.live_request_count === 66,
  unsupported_facts: unsupportedFacts,
  factual_relevance_nonregression: quality.factual_relevance_nonregression,
  therapy_critical_errors: therapyCritical,
  privacy_critical_errors: privacyCritical,
  identity_critical_errors: identityCritical,
  overall_preference: quality.overall_hybrid_preference,
  brand_preference: quality.brand_voice_preference,
  packet_adherence: quality.packet_adherence,
  customer_service_tone_reduction: quality.customer_service_tone_reduction,
  over_explanation_reduction: quality.over_explanation_reduction,
  measurable_local_influence: quality.measurable_local_influence,
  substantive_local_influence: quality.substantive_local_influence,
  deepseek_only_ttft_p95_ms: deepseekTtft.p95,
  hybrid_ttft_p95_ms: hybridTtft.p95,
  hybrid_completion_p95_ms: hybridCompletion.p95,
  secret_scan_pass: secretScan.pass,
  no_production_modifications: postLiveGates.no_production_modifications,
  all_tests_pass: postLiveGates.all_tests_pass,
};
const decision = decideHybridV2Terminal(gateMetrics);
assert.equal(decision.terminal, "BLOCKED_HYBRID_V2_FACTUAL");
assert.equal(decision.training_authorized, false);

const cost = {
  live_request_count: supervisor.live_request_count,
  maximum_live_requests: supervisor.maximum_total_requests,
  input_tokens: supervisor.input_tokens,
  output_tokens: supervisor.output_tokens,
  cache_hit_tokens: supervisor.cache_hit_tokens,
  cache_miss_tokens: supervisor.cache_miss_tokens,
  estimated_cost_usd: supervisor.estimated_cost_usd,
  estimated_cost_cny_conservative_upper_bound: supervisor.estimated_cost_cny_conservative_upper_bound,
  maximum_estimated_cost_cny: supervisor.maximum_estimated_cost_cny,
  cost_pass: supervisor.estimated_cost_cny_conservative_upper_bound <= supervisor.maximum_estimated_cost_cny,
};

const conditionalHeads = [
  {
    name: "Grounded Anchor Salience",
    input: "short current user message; optional bounded recent context only if later proven necessary",
    output: "per-token salience probability",
    post_processing: "select exact non-generated spans from current user text",
    must_never: "generate text",
  },
  {
    name: "Style Classifier",
    input: "current user message plus bounded conversation state",
    output: ["quiet_warm", "concise_direct", "reflective", "playful_light", "balanced", "matter_of_fact"],
    must_never: "produce any other model output",
  },
];

const finalReport = {
  campaign: "R29B2M-R4H-R2",
  base_commit: "23fc26f25aaa6055aee4ceab62b9f67964c84c49",
  previous_campaign: { campaign: "R29B2M-R4H-R1", terminal: oldTerminal.terminal, terminal_modified: false },
  terminal: decision.terminal,
  failed_gates_at_terminal_priority: decision.failed_gates,
  gate_priority_order: decision.priority_order,
  v1: { overall_preference: 0.50, brand_preference: 0.60, factual_relevance_nonregression: 0.80, unsupported_facts: 3 },
  v2: {
    overall_preference: quality.overall_hybrid_preference,
    brand_preference: quality.brand_voice_preference,
    factual_relevance_nonregression: quality.factual_relevance_nonregression,
    unsupported_facts: quality.hybrid_unsupported_fact_flags,
  },
  direct_delta: {
    overall_preference_percentage_points: round((quality.overall_hybrid_preference - 0.50) * 100, 6),
    brand_preference_percentage_points: round((quality.brand_voice_preference - 0.60) * 100, 6),
    factual_relevance_nonregression_percentage_points: round((quality.factual_relevance_nonregression - 0.80) * 100, 6),
    unsupported_fact_case_count: quality.hybrid_unsupported_fact_flags - 3,
  },
  quality,
  anchor_effects: valueAnalysis.summary,
  latency,
  cost,
  local_signal_budget: localBudget,
  secret_scan_pass: secretScan.pass,
  old_r1_terminal_unchanged: true,
  no_production_modifications: postLiveGates.no_production_modifications,
  signal_head_training_performed: false,
  model_weights_modified: false,
  optimizer_tokens: 0,
  assistant_target_tokens: 0,
  parent_checkpoint_id: null,
  candidate_checkpoint_id: null,
  training_authorized: decision.training_authorized,
  authorized_next_heads: [],
  conditional_unapproved_head_contract: conditionalHeads,
  backbone_comparison_plan: {
    training_in_this_round: false,
    backbone_A: "R28M1 q4-recovered base representation",
    backbone_B: "R3 stage_a_080k representation",
    method: "Compare frozen-backbone probe quality on uncontaminated family-level splits plus end-to-end local latency; do not assume Stage A is better.",
  },
  browser_live_requests: 0,
  field_ablation_requests: 0,
  raw_responses_committed: false,
  api_telemetry_committed: false,
  weights_or_corpus_committed: false,
  tests: postLiveGates,
};

await atomicJson(join(REPORT_ROOT, "live_quality_and_value_v2.json"), quality);
await atomicJson(join(REPORT_ROOT, "live_latency_v2.json"), latency);
await atomicJson(join(REPORT_ROOT, "live_cost_v2.json"), cost);
await atomicJson(join(REPORT_ROOT, "local_signal_budget_v2.json"), localBudget);
await atomicJson(join(REPORT_ROOT, "final_report.json"), finalReport);
await atomicJson(join(REPORT_ROOT, "final_terminal.json"), {
  campaign: finalReport.campaign,
  terminal: finalReport.terminal,
  training_authorized: false,
  failed_gates_at_terminal_priority: decision.failed_gates,
  old_R4H_R1_terminal: oldTerminal.terminal,
  old_R4H_R1_terminal_modified: false,
  live_request_count: supervisor.live_request_count,
  browser_live_request_count: 0,
  field_ablation_request_count: 0,
  secret_scan_passed: secretScan.pass,
  all_tests_passed: postLiveGates.all_tests_pass,
  signal_head_training_performed: false,
  model_weights_modified: false,
  production_route_created: false,
  production_ui_modified: false,
  production_deployment: false,
});

supervisor.state = decision.terminal;
supervisor.terminal = decision.terminal;
supervisor.training_authorized = false;
supervisor.completed_at = new Date().toISOString();
await atomicJson(join(ARTIFACT_ROOT, "supervisor_state.json"), supervisor);
await atomicJson(join(ARTIFACT_ROOT, "heartbeat_latest.json"), { ...supervisor, heartbeat_at: supervisor.completed_at, process_active: false });

console.log(JSON.stringify({
  terminal: decision.terminal,
  training_authorized: false,
  live_requests: supervisor.live_request_count,
  overall_preference: quality.overall_hybrid_preference,
  brand_preference: quality.brand_voice_preference,
  factual_nonregression: quality.factual_relevance_nonregression,
  unsupported_facts: quality.hybrid_unsupported_fact_flags,
  latency_pass: latency.latency_pass,
  cost_cny_upper_bound: cost.estimated_cost_cny_conservative_upper_bound,
  secret_scan_pass: secretScan.pass,
}));
