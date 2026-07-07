import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { IDENTITY_ANSWER, isIdentityQuestion } from "../../src/browser_runtime/router/identity_route.ts";

test("Chinese identity route returns crocodile identity boundary", () => {
  assert.equal(isIdentityQuestion("你是谁？"), true);
  const classified = classifyAnswerRoute({ user_input: "你是谁？", evidence_status: "insufficient", model_output: "乱答" });
  assert.equal(classified.route, "identity_boundary");
  assert.equal(classified.use_model_draft, false);
  const surfaced = applyAnswerSurfacePolicy({ user_input: "你是谁？", evidence_status: "insufficient" });
  assert.equal(surfaced.final_answer, IDENTITY_ANSWER);
  assert.equal(surfaced.fallback_used, false);
});
