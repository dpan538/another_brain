import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { answerVisibleCharCount } from "../../src/browser_runtime/router/answer_length_policy.ts";

test("greeting returns a short fast surface", () => {
  const routed = applyAnswerSurfacePolicy({ user_input: "你好", evidence_status: "none", model_output: "" });
  assert.equal(routed.route, "greeting_surface");
  assert.equal(routed.surface_category, "greeting");
  assert.equal(routed.final_answer_source, "router_surface");
  assert.equal(routed.use_model_draft, false);
  assert.ok(answerVisibleCharCount(routed.final_answer) <= 20);
  assert.equal(routed.length_policy.category, "greeting");
});
