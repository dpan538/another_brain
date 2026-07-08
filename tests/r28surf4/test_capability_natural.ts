import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("capability surface keeps judgment and evidence boundaries", () => {
  const routed = classifyAnswerRoute({ user_input: "你能做什么", evidence_status: "sufficient", model_output: "模型草稿" });
  assert.equal(routed.route, "capability_surface");
  assert.ok(/证据|拒答|判断|边界|停住/.test(routed.final_answer));
  assert.ok(routed.final_answer.length <= 44);
  assert.ok(!routed.final_answer.includes("普通开放问题仍会走"));
});
