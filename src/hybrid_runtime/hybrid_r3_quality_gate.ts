export type HybridR3Terminal =
  | "PASSED_ONE_CALL_CONTROLLED_HYBRID"
  | "PASSED_CANONICAL_DRAFT_CRITIC_HYBRID"
  | "BLOCKED_HYBRID_ARCHITECTURE"
  | "BLOCKED_LIVE_CONFIGURATION"
  | "ABORTED_SAFELY";

export interface OneCallMetrics {
  unsupported_facts: number;
  factual_relevance_nonregression: number;
  overall_preference: number;
  brand_preference: number;
}

export interface TwoStageMetrics extends OneCallMetrics {
  semantic_guard_false_negative_critical_cases: number;
  critical_regressions: number;
  natural_voice_preference: number;
  customer_service_tone_reduction: number;
  over_explanation_reduction: number;
  safe_rewrite_accept_rate: number;
  final_answer_ready_p50_ms: number;
  final_answer_ready_p95_ms: number;
  final_answer_ready_max_ms: number;
}

export function oneCallDiagnosticFailures(metrics: OneCallMetrics): string[] {
  return [
    metrics.unsupported_facts !== 0 ? "unsupported_facts" : null,
    metrics.factual_relevance_nonregression < 0.95 ? "factual_relevance_nonregression" : null,
    metrics.overall_preference < 0.55 ? "overall_preference" : null,
    metrics.brand_preference < 0.60 ? "brand_preference" : null,
  ].filter((value): value is string => value !== null);
}

export function oneCallFinalFailures(metrics: OneCallMetrics): string[] {
  return [
    metrics.unsupported_facts !== 0 ? "unsupported_facts" : null,
    metrics.factual_relevance_nonregression < 0.98 ? "factual_relevance_nonregression" : null,
    metrics.overall_preference < 0.60 ? "overall_preference" : null,
    metrics.brand_preference < 0.65 ? "brand_preference" : null,
  ].filter((value): value is string => value !== null);
}

export function twoStageFailures(metrics: TwoStageMetrics): string[] {
  return [
    metrics.unsupported_facts !== 0 ? "unsupported_accepted_facts" : null,
    metrics.semantic_guard_false_negative_critical_cases !== 0 ? "semantic_guard_false_negative_critical_cases" : null,
    metrics.factual_relevance_nonregression < 1 ? "factual_relevance_nonregression" : null,
    metrics.critical_regressions !== 0 ? "critical_regressions" : null,
    metrics.overall_preference < 0.60 ? "overall_preference" : null,
    metrics.brand_preference < 0.65 ? "brand_preference" : null,
    metrics.natural_voice_preference < 0.65 ? "natural_voice_preference" : null,
    metrics.customer_service_tone_reduction < 0.30 ? "customer_service_tone_reduction" : null,
    metrics.over_explanation_reduction < 0.25 ? "over_explanation_reduction" : null,
    metrics.safe_rewrite_accept_rate < 0.40 ? "safe_rewrite_accept_rate" : null,
    metrics.final_answer_ready_p50_ms > 3_000 ? "final_answer_ready_p50" : null,
    metrics.final_answer_ready_p95_ms > 5_000 ? "final_answer_ready_p95" : null,
    metrics.final_answer_ready_max_ms > 8_000 ? "final_answer_ready_hard_ceiling" : null,
  ].filter((value): value is string => value !== null);
}

export function decideHybridR3Terminal(input: {
  configuration_pass: boolean;
  secret_scan_pass: boolean;
  no_product_deployment: boolean;
  no_training: boolean;
  all_tests_pass: boolean;
  one_call_final_metrics?: OneCallMetrics;
  two_stage_metrics?: TwoStageMetrics;
}): { terminal: HybridR3Terminal; training_authorized: boolean; failed_gates: string[] } {
  if (!input.configuration_pass || !input.secret_scan_pass) {
    return { terminal: "BLOCKED_LIVE_CONFIGURATION", training_authorized: false, failed_gates: [!input.configuration_pass ? "configuration" : null, !input.secret_scan_pass ? "secret_scan" : null].filter((value): value is string => value !== null) };
  }
  if (!input.no_product_deployment || !input.no_training || !input.all_tests_pass) {
    return { terminal: "ABORTED_SAFELY", training_authorized: false, failed_gates: [!input.no_product_deployment ? "product_deployment" : null, !input.no_training ? "training" : null, !input.all_tests_pass ? "tests" : null].filter((value): value is string => value !== null) };
  }
  if (input.one_call_final_metrics && oneCallFinalFailures(input.one_call_final_metrics).length === 0) {
    return { terminal: "PASSED_ONE_CALL_CONTROLLED_HYBRID", training_authorized: false, failed_gates: [] };
  }
  if (input.two_stage_metrics) {
    const failures = twoStageFailures(input.two_stage_metrics);
    if (failures.length === 0) return { terminal: "PASSED_CANONICAL_DRAFT_CRITIC_HYBRID", training_authorized: true, failed_gates: [] };
    return { terminal: "BLOCKED_HYBRID_ARCHITECTURE", training_authorized: false, failed_gates: failures };
  }
  return { terminal: "BLOCKED_HYBRID_ARCHITECTURE", training_authorized: false, failed_gates: ["no_architecture_passed"] };
}
