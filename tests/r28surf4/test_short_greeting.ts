import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("greeting surface is short and natural", () => {
  const routed = classifyAnswerRoute({ user_input: "你好", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.equal(routed.route, "greeting_surface");
  assert.equal(routed.use_model_draft, false);
  assert.ok(["你好，我在。", "你好，直接问。", "在。你问。"].includes(routed.final_answer));
  assert.ok(routed.final_answer.length <= 8);
});
