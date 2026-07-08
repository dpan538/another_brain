import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("origin surface is natural without excess architecture", () => {
  const routed = classifyAnswerRoute({ user_input: "你从哪里来", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.equal(routed.route, "origin_surface");
  assert.ok(/本地|网页|模型|边界|检索/.test(routed.final_answer));
  assert.ok(routed.final_answer.length <= 48);
  assert.ok(!routed.final_answer.includes("云端 LLM"));
  assert.ok(!routed.final_answer.includes("Doubao"));
});
