import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("identity route does not claim product admission or generic assistant status", () => {
  const surfaced = applyAnswerSurfacePolicy({ user_input: "你是什么", evidence_status: "none" });
  assert.equal(surfaced.route, "identity_boundary");
  assert.equal(surfaced.final_answer.includes("AI assistant"), false);
  assert.equal(surfaced.final_answer.includes("产品模型"), false);
  assert.ok(surfaced.non_claims.includes("not product admission"));
});
