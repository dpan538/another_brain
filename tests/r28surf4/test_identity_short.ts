import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("identity answer is short and crocodile-like", () => {
  const routed = classifyAnswerRoute({ user_input: "你是谁", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.equal(routed.route, "identity_surface");
  assert.equal(routed.final_answer_source, "router_surface");
  assert.ok(routed.final_answer.includes("鳄鱼"));
  assert.ok(routed.final_answer.length <= 24);
  assert.ok(!routed.final_answer.includes("产品"));
  assert.ok(!routed.final_answer.includes("架构"));
});
