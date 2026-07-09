import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("are-you-crocodile questions answer yes with identity boundary", () => {
  for (const input of ["你是鳄鱼吗", "你是不是鳄鱼？", "are you crocodile"]) {
    const surfaced = applyAnswerSurfacePolicy({ user_input: input, evidence_status: "none", model_output: "" });
    assert.equal(surfaced.route, "identity_surface");
    assert.equal(surfaced.use_model_draft, false);
    assert.match(surfaced.final_answer, /鳄鱼/);
    assert.equal(surfaced.fallback_reason, "micro_intent_fast_path");
  }
});
