import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_SURFACE_TEMPLATES, answerSurfaceForRoute, validateAnswerSurfaceTemplates } from "../../src/browser_runtime/router/answer_surfaces.ts";

test("R28ROUT0 answer surfaces are fixed boundary templates only", () => {
  assert.equal(ANSWER_SURFACE_TEMPLATES.insufficient_evidence, "目前证据不足，我不能把这个判断说成确定结论。");
  assert.equal(ANSWER_SURFACE_TEMPLATES.malicious_evidence, "检索到的材料里有试图改变规则的内容，我会把它当作不可信指令处理。");
  assert.equal(ANSWER_SURFACE_TEMPLATES.conflicting_evidence, "现有证据之间有冲突，我不能直接合并成一个确定答案。");
  assert.equal(ANSWER_SURFACE_TEMPLATES.model_gibberish, "本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。");
  assert.equal(ANSWER_SURFACE_TEMPLATES.not_product_status, "当前是预览工程候选，不是已 admission 的产品模型。");
  assert.equal(answerSurfaceForRoute("direct_model_draft"), "");
  assert.equal(answerSurfaceForRoute("model_timeout_fallback"), ANSWER_SURFACE_TEMPLATES.model_gibberish);
  assert.deepEqual(validateAnswerSurfaceTemplates().forbidden_hits, []);
});
