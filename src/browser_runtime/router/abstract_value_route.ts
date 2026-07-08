import { abstractValueFallbackSurface } from "./abstract_value_surfaces.ts";
import { classifyOpenQuestionRoute, openQuestionShouldAttemptQ4 } from "./open_question_route.ts";

export function routeAbstractValueQuestion(input = "") {
  const route = classifyOpenQuestionRoute(input);
  return {
    ...route,
    should_attempt_q4: openQuestionShouldAttemptQ4(route),
    fallback_answer: abstractValueFallbackSurface(input, { route }),
    answer_bank: false,
    broad_answer_bank: false
  };
}
