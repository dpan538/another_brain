import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";
import { isIdentityQuestion } from "../../src/browser_runtime/router/identity_route.ts";

test("identity route is narrow and does not become a broad answer bank", () => {
  assert.equal(isIdentityQuestion("法国首都是哪里"), false);
  const route = classifyAnswerRoute({
    user_input: "法国首都是哪里",
    evidence_status: "none",
    model_output: ""
  });
  assert.notEqual(route.route, "identity_boundary");
});
