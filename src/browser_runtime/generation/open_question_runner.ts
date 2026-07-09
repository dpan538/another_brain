import { buildGenerationResult } from "./generation_result.ts";
import { generationWatchdogProfile } from "./generation_watchdog.ts";
import { routeAbstractValueQuestion } from "../router/abstract_value_route.ts";

export function buildOpenQuestionPlan(input = "", runtimeState = {}) {
  const route = routeAbstractValueQuestion(input);
  const q4Ready = runtimeState.q4_ready === true;
  const profile = generationWatchdogProfile(runtimeState.environment || {});
  return {
    route,
    should_attempt_q4: route.should_attempt_q4 === true && q4Ready,
    blocker: route.should_attempt_q4 && !q4Ready ? (runtimeState.blocker || "q4_not_ready") : "",
    profile
  };
}

export function finalizeOpenQuestionResult(input = "", generation = {}, runtimeState = {}) {
  const plan = buildOpenQuestionPlan(input, runtimeState);
  const result = buildGenerationResult(generation);
  if (!plan.should_attempt_q4 || result.generation_status !== "completed" || result.tokens_generated <= 0) {
    return {
      answer_source: "fallback",
      fallback_reason: plan.blocker || result.fallback_reason || "q4_generation_timeout",
      final_answer: plan.route.fallback_answer,
      route: plan.route.route,
      generation: result
    };
  }
  return {
    answer_source: "model_draft",
    fallback_reason: "",
    final_answer: generation.draft || "",
    route: plan.route.route,
    generation: result
  };
}
