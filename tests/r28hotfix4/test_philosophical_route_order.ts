import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpenQuestionRoute } from "../../src/browser_runtime/router/open_question_route.ts";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("philosophical trigger wins before abstract value trigger", () => {
  const route = classifyOpenQuestionRoute("人为什么要活着？");
  assert.equal(route.category, "philosophical_question");
  assert.equal(route.reason, "philosophical_trigger");

  const answerRoute = classifyAnswerRoute({
    user_input: "人为什么要活着？",
    evidence_status: "none",
    model_output: ""
  });
  assert.equal(answerRoute.route, "philosophical_question");
  assert.equal(answerRoute.use_model_draft, false);
  assert.match(answerRoute.final_answer, /人为什么活着|有限性/);
});

test("life/death remains abstract value instead of philosophical catch-all", () => {
  const route = classifyOpenQuestionRoute("你如何看待生与死？");
  assert.equal(route.category, "abstract_value_question");
  assert.equal(route.reason, "abstract_value_trigger");
});
