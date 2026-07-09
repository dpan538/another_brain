import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("q4 timeout receives explicit timeout surface metadata", () => {
  const routed = applyAnswerSurfacePolicy({
    user_input: "你如何看待生与死？",
    evidence_status: "none",
    model_output: "",
    generation_flags: ["generation_timeout"]
  });
  assert.equal(routed.route, "model_timeout_fallback");
  assert.equal(routed.surface_category, "q4_timeout_fallback");
  assert.equal(routed.fallback_reason, "generation_timeout");
  assert.equal(routed.final_answer_source, "router_boundary");
  assert.match(routed.final_answer, /超时|时限|边界/);
});
