import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { answerVisibleCharCount } from "../../src/browser_runtime/router/answer_length_policy.ts";

test("abstract value fallback is bounded and judgment-shaped", () => {
  const routed = classifyAnswerRoute({ user_input: "你如何看待生与死？", evidence_status: "none", model_output: "" });
  assert.equal(routed.route, "abstract_value_question");
  assert.equal(routed.surface_category, "abstract_value_fallback");
  assert.equal(routed.use_model_draft, false);
  assert.ok(answerVisibleCharCount(routed.final_answer) <= 160);
  assert.match(routed.final_answer, /边界|有限|判断|虚无/);
});
