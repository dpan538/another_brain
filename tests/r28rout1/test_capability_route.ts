import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("capability questions return bounded capability surface", () => {
  const surfaced = applyAnswerSurfacePolicy({ user_input: "你能做什么？", evidence_status: "insufficient", model_output: "" });
  assert.equal(surfaced.route, "capability_surface");
  assert.match(surfaced.final_answer, /边界判断/);
  assert.match(surfaced.final_answer, /证据整理/);
  assert.doesNotMatch(surfaced.final_answer, /万能|通用客服/);
  assert.equal(surfaced.fallback_used, false);
});
