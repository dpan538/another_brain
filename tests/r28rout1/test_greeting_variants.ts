import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("greeting variants route to a fast greeting surface", () => {
  for (const input of ["你好", "hello", "在吗？", "晚上好"]) {
    const classified = classifyAnswerRoute({ user_input: input, evidence_status: "none", model_output: "" });
    assert.equal(classified.route, "greeting_surface");
    assert.equal(classified.use_model_draft, false);
    assert.equal(classified.fallback_reason, "micro_intent_fast_path");
    const surfaced = applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" });
    assert.equal(surfaced.fallback_used, false);
    assert.match(surfaced.final_answer, /你好|我在|直接问|本地证据/);
  }
});
