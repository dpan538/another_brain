import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("origin question answers from local static boundary without external claims", () => {
  const route = classifyAnswerRoute({ user_input: "你从哪里来", evidence_status: "none" });
  assert.equal(route.route, "origin_surface");
  assert.equal(route.use_model_draft, false);
  assert.equal(route.final_answer_source, "router_surface");
  assert.match(route.final_answer, /本地|静态|local|static/i);
  assert.match(route.final_answer, /不会把问题发给云端|外部 LLM|后端推理|不是已 admission/);
});
