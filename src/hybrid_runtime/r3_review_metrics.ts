import { oneCallDiagnosticFailures, oneCallFinalFailures, twoStageFailures } from "./hybrid_r3_quality_gate.ts";

export type BlindWinner = "A" | "B" | "tie";

export interface BlindResponseReview {
  unsupported_facts: number;
  factual_relevance_pass: boolean;
  critical_error: boolean;
  customer_service_tone: boolean;
  over_explained: boolean;
}

export interface BlindPairReview {
  pair_id: string;
  overall_preference: BlindWinner;
  brand_preference: BlindWinner;
  natural_voice_preference: BlindWinner;
  factual_relevance_preference: BlindWinner | "equal";
  major_wording_difference: boolean;
  semantic_outcome_difference: boolean;
  response_A: BlindResponseReview;
  response_B: BlindResponseReview;
}

export interface ArmMapRow {
  pair_id: string;
  response_A: string;
  response_B: string;
}

function armSide(row: ArmMapRow, arm: string): "A" | "B" {
  if (row.response_A === arm) return "A";
  if (row.response_B === arm) return "B";
  throw new Error(`arm_missing:${row.pair_id}:${arm}`);
}

function responseAt(review: BlindPairReview, side: "A" | "B"): BlindResponseReview {
  return side === "A" ? review.response_A : review.response_B;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export function validateBlindReviews(reviews: BlindPairReview[], armMap: ArmMapRow[]): void {
  if (!reviews.length || reviews.length !== armMap.length) throw new Error("blind_review_count_mismatch");
  const ids = new Set<string>();
  for (const review of reviews) {
    if (ids.has(review.pair_id)) throw new Error(`duplicate_blind_review:${review.pair_id}`);
    ids.add(review.pair_id);
    if (!["A", "B", "tie"].includes(review.overall_preference) || !["A", "B", "tie"].includes(review.brand_preference) ||
        !["A", "B", "tie"].includes(review.natural_voice_preference) || !["A", "B", "tie", "equal"].includes(review.factual_relevance_preference)) {
      throw new Error(`invalid_blind_winner:${review.pair_id}`);
    }
    for (const response of [review.response_A, review.response_B]) {
      if (!Number.isInteger(response.unsupported_facts) || response.unsupported_facts < 0) throw new Error(`invalid_unsupported_count:${review.pair_id}`);
      for (const value of [response.factual_relevance_pass, response.critical_error, response.customer_service_tone, response.over_explained]) {
        if (typeof value !== "boolean") throw new Error(`invalid_response_review:${review.pair_id}`);
      }
    }
  }
  for (const map of armMap) if (!ids.has(map.pair_id)) throw new Error(`blind_review_missing:${map.pair_id}`);
}

export function oneCallReviewMetrics(reviews: BlindPairReview[], armMap: ArmMapRow[], treatmentArm = "v2_anchors_style") {
  validateBlindReviews(reviews, armMap);
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let brandWins = 0;
  let naturalWins = 0;
  let unsupported = 0;
  let factualNonregression = 0;
  let criticalRegressions = 0;
  let measurableInfluence = 0;
  let substantiveInfluence = 0;
  let controlCustomerService = 0;
  let reducedCustomerService = 0;
  let controlOverExplained = 0;
  let reducedOverExplanation = 0;
  for (const review of reviews) {
    const map = armMap.find((row) => row.pair_id === review.pair_id);
    if (!map) throw new Error(`arm_map_missing:${review.pair_id}`);
    const hybridSide = armSide(map, treatmentArm);
    const controlSide = hybridSide === "A" ? "B" : "A";
    const hybrid = responseAt(review, hybridSide);
    const control = responseAt(review, controlSide);
    if (review.overall_preference === hybridSide) wins += 1;
    else if (review.overall_preference === controlSide) losses += 1;
    else ties += 1;
    if (review.brand_preference === hybridSide) brandWins += 1;
    if (review.natural_voice_preference === hybridSide) naturalWins += 1;
    unsupported += hybrid.unsupported_facts;
    if (hybrid.factual_relevance_pass && review.factual_relevance_preference !== controlSide) factualNonregression += 1;
    if (hybrid.critical_error && !control.critical_error) criticalRegressions += 1;
    if (review.major_wording_difference || review.semantic_outcome_difference) measurableInfluence += 1;
    if (review.semantic_outcome_difference) substantiveInfluence += 1;
    if (control.customer_service_tone) {
      controlCustomerService += 1;
      if (!hybrid.customer_service_tone) reducedCustomerService += 1;
    }
    if (control.over_explained) {
      controlOverExplained += 1;
      if (!hybrid.over_explained) reducedOverExplanation += 1;
    }
  }
  return {
    pair_count: reviews.length,
    wins,
    losses,
    ties,
    unsupported_facts: unsupported,
    factual_relevance_nonregression: factualNonregression / reviews.length,
    critical_regressions: criticalRegressions,
    overall_preference: wins / reviews.length,
    brand_preference: brandWins / reviews.length,
    natural_voice_preference: naturalWins / reviews.length,
    measurable_local_influence: measurableInfluence / reviews.length,
    substantive_local_influence: substantiveInfluence / reviews.length,
    customer_service_tone_reduction: rate(reducedCustomerService, controlCustomerService),
    over_explanation_reduction: rate(reducedOverExplanation, controlOverExplained),
  };
}

export function oneCallDecision(metrics: ReturnType<typeof oneCallReviewMetrics>, stage: "diagnostic" | "final") {
  const failures = stage === "diagnostic" ? oneCallDiagnosticFailures(metrics) : oneCallFinalFailures(metrics);
  return { passed: failures.length === 0, failed_gates: failures };
}

export function providerVarianceMetrics(reviews: Array<{
  pair_id: string;
  exact_text_match: boolean;
  semantic_equivalent: boolean;
  factual_equivalent: boolean;
  major_wording_difference: boolean;
  replicate_A_unsupported_facts: number;
  replicate_B_unsupported_facts: number;
}>) {
  if (reviews.length !== 12 || new Set(reviews.map((row) => row.pair_id)).size !== 12) throw new Error("provider_variance_review_not_12");
  return {
    case_count: reviews.length,
    request_count: reviews.length * 2,
    exact_text_match_rate: reviews.filter((row) => row.exact_text_match).length / reviews.length,
    semantic_equivalence_rate: reviews.filter((row) => row.semantic_equivalent).length / reviews.length,
    factual_equivalence_rate: reviews.filter((row) => row.factual_equivalent).length / reviews.length,
    provider_residual_variance_rate: reviews.filter((row) => !row.semantic_equivalent || !row.factual_equivalent).length / reviews.length,
    major_wording_variance_rate: reviews.filter((row) => row.major_wording_difference).length / reviews.length,
    unsupported_facts: reviews.reduce((sum, row) => sum + row.replicate_A_unsupported_facts + row.replicate_B_unsupported_facts, 0),
  };
}

export function twoStageReviewMetrics(
  reviews: BlindPairReview[],
  armMap: ArmMapRow[],
  chains: Array<{ pair_id: string; semantic_guard: { accepted: boolean }; final_answer_ready_latency_ms: number; critic_execution_count: number; rewrite_attempt_count: number; unvalidated_stream_exposed: boolean }>,
) {
  validateBlindReviews(reviews, armMap);
  if (chains.length !== reviews.length) throw new Error("two_stage_chain_count_mismatch");
  let wins = 0;
  let brandWins = 0;
  let naturalWins = 0;
  let factualNonregression = 0;
  let criticalRegressions = 0;
  let unsupportedAccepted = 0;
  let guardFalseNegativeCritical = 0;
  let acceptedCount = 0;
  let acceptedBrandWins = 0;
  let controlCustomerService = 0;
  let reducedCustomerService = 0;
  let controlOverExplained = 0;
  let reducedOverExplanation = 0;
  for (const review of reviews) {
    const map = armMap.find((row) => row.pair_id === review.pair_id);
    const chain = chains.find((row) => row.pair_id === review.pair_id);
    if (!map || !chain) throw new Error(`two_stage_pair_missing:${review.pair_id}`);
    const hybridSide = map.response_A === "canonical_control" ? "B" : "A";
    const controlSide = hybridSide === "A" ? "B" : "A";
    const hybrid = responseAt(review, hybridSide);
    const control = responseAt(review, controlSide);
    if (review.overall_preference === hybridSide) wins += 1;
    if (review.brand_preference === hybridSide) brandWins += 1;
    if (review.natural_voice_preference === hybridSide) naturalWins += 1;
    if (hybrid.factual_relevance_pass && review.factual_relevance_preference !== controlSide) factualNonregression += 1;
    if (hybrid.critical_error && !control.critical_error) criticalRegressions += 1;
    if (chain.semantic_guard.accepted) {
      acceptedCount += 1;
      unsupportedAccepted += hybrid.unsupported_facts;
      if (review.brand_preference === hybridSide) acceptedBrandWins += 1;
      if (hybrid.critical_error || hybrid.unsupported_facts > 0 || !hybrid.factual_relevance_pass || review.factual_relevance_preference === controlSide) guardFalseNegativeCritical += 1;
    }
    if (control.customer_service_tone) {
      controlCustomerService += 1;
      if (!hybrid.customer_service_tone) reducedCustomerService += 1;
    }
    if (control.over_explained) {
      controlOverExplained += 1;
      if (!hybrid.over_explained) reducedOverExplanation += 1;
    }
  }
  const latencies = chains.map((row) => row.final_answer_ready_latency_ms).sort((left, right) => left - right);
  const percentile = (q: number) => latencies[Math.min(latencies.length - 1, Math.ceil(q * latencies.length) - 1)];
  const metrics = {
    pair_count: reviews.length,
    unsupported_facts: unsupportedAccepted,
    semantic_guard_false_negative_critical_cases: guardFalseNegativeCritical,
    factual_relevance_nonregression: factualNonregression / reviews.length,
    critical_regressions: criticalRegressions,
    overall_preference: wins / reviews.length,
    brand_preference: brandWins / reviews.length,
    natural_voice_preference: naturalWins / reviews.length,
    customer_service_tone_reduction: rate(reducedCustomerService, controlCustomerService),
    over_explanation_reduction: rate(reducedOverExplanation, controlOverExplained),
    critic_execution_rate: chains.filter((row) => row.critic_execution_count === 1).length / chains.length,
    rewrite_attempt_rate: chains.filter((row) => row.rewrite_attempt_count === 1).length / chains.length,
    safe_rewrite_accept_rate: acceptedCount / chains.length,
    brand_improvement_among_accepted: rate(acceptedBrandWins, acceptedCount),
    canonical_fallback_rate: (chains.length - acceptedCount) / chains.length,
    factual_regression_rate: 1 - factualNonregression / reviews.length,
    final_answer_ready_p50_ms: percentile(0.5),
    final_answer_ready_p95_ms: percentile(0.95),
    final_answer_ready_max_ms: Math.max(...latencies),
    unvalidated_stream_exposed: chains.some((row) => row.unvalidated_stream_exposed),
  };
  return { ...metrics, failed_gates: twoStageFailures(metrics), passed: twoStageFailures(metrics).length === 0 };
}
