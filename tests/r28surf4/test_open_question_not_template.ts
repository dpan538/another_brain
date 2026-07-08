import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnswerRoute } from "../../src/browser_runtime/router/route_classifier.ts";

test("ordinary open questions do not use narrow micro-surface templates", () => {
  const routed = classifyAnswerRoute({
    user_input: "请解释量子纠缠对现代密码学的影响",
    evidence_status: "sufficient",
    model_output: "这是模型草稿"
  });
  assert.equal(routed.use_model_draft, true);
  assert.ok(!String(routed.route).endsWith("_surface"));
  assert.equal(routed.broad_answer_bank, undefined);
});
