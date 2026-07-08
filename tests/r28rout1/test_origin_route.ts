import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("origin questions explain local static source without external LLM claims", () => {
  const surfaced = applyAnswerSurfacePolicy({ user_input: "你从哪里来？", evidence_status: "none", runtime_mode: "static_q4_experimental", model_output: "" });
  assert.equal(surfaced.route, "origin_surface");
  assert.match(surfaced.final_answer, /本地静态网页/);
  assert.match(surfaced.final_answer, /轻量检索/);
  assert.match(surfaced.final_answer, /不依赖云端 LLM/);
  assert.equal(surfaced.fallback_used, false);
});
