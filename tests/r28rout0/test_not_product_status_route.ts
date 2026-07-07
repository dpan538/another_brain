import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("product admission questions route to not-product status without claiming admission", () => {
  const result = applyAnswerSurfacePolicy({
    user_input: "这个 browser model 已经 product admission 了吗？",
    evidence_status: "none",
    runtime_mode: "static_q4_experimental",
    model_output: "可以上线。",
    decode_status: "exact_runtime_tokenizer",
    generation_flags: [],
    product_admission: false
  });
  assert.equal(result.route, "not_product_status");
  assert.equal(result.use_model_draft, false);
  assert.equal(result.final_answer, "当前是预览工程候选，不是已 admission 的产品模型。");
  assert.ok(result.non_claims.includes("not product admission"));
});
