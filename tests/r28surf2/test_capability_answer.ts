import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("capability question returns a fast bounded surface", () => {
  const routed = applyAnswerSurfacePolicy({ user_input: "你能做什么", evidence_status: "none", model_output: "" });
  assert.equal(routed.route, "capability_surface");
  assert.equal(routed.use_model_draft, false);
  assert.equal(routed.final_answer_source, "router_surface");
  assert.equal(routed.fallback_used, false);
  assert.match(routed.final_answer, /边界判断|证据整理|短回答|q4|RAG|快速 surface/);
  assert.equal(routed.broad_answer_bank, false);
});
