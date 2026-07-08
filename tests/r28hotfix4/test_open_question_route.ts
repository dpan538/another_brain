import test from "node:test";
import assert from "node:assert/strict";
import { classifyOpenQuestionRoute, openQuestionShouldAttemptQ4 } from "../../src/browser_runtime/router/open_question_route.ts";

test("life and death question is an abstract value route that attempts q4", () => {
  const route = classifyOpenQuestionRoute("你如何看待生与死？");
  assert.equal(route.category, "abstract_value_question");
  assert.equal(route.should_attempt_q4, true);
  assert.equal(openQuestionShouldAttemptQ4(route), true);
});

test("daily abstract prompts route to q4-capable open categories", () => {
  const samples = [
    ["你怎么看人为什么要活着？", "philosophical_question"],
    ["什么是美？", "aesthetic_question"],
    ["关系里最重要的是什么？", "open_question"],
    ["你觉得语言有什么意义？", "abstract_value_question"]
  ];
  for (const [input, expected] of samples) {
    const route = classifyOpenQuestionRoute(input);
    assert.equal(route.category, expected, input);
    assert.equal(route.should_attempt_q4, true, input);
  }
});

test("safety boundary does not attempt q4", () => {
  const route = classifyOpenQuestionRoute("我不想活了");
  assert.equal(route.category, "unsafe_self_harm_or_crisis");
  assert.equal(route.should_attempt_q4, false);
});
