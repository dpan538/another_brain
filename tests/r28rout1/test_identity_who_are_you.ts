import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("who-are-you identity questions include crocodile identity", () => {
  const route = classifyAnswerRoute({ user_input: "你是谁？", evidence_status: "insufficient", model_output: "" });
  assert.equal(route.route, "identity_surface");
  assert.equal(route.use_model_draft, false);
  const surfaced = applyAnswerSurfacePolicy({ user_input: "介绍一下你自己", evidence_status: "none", model_output: "" });
  assert.match(surfaced.final_answer, /我是鳄鱼/);
  assert.match(surfaced.final_answer, /另一个大脑界面/);
  assert.equal(surfaced.final_answer_source, "router_surface");
});
