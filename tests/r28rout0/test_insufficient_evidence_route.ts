import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("insufficient evidence routes to a Chinese boundary surface", () => {
  const result = applyAnswerSurfacePolicy({
    user_input: "这个本地事实是什么？",
    evidence_status: "insufficient",
    runtime_mode: "static_q4_experimental",
    model_output: "模型猜测答案",
    decode_status: "exact_runtime_tokenizer",
    generation_flags: [],
    adapter_context_present: false,
    product_admission: false
  });
  assert.equal(result.route, "insufficient_evidence_boundary");
  assert.equal(result.use_model_draft, false);
  assert.equal(result.fallback_reason, "insufficient_evidence");
  assert.equal(result.final_answer, "目前证据不足，我不能把这个判断说成确定结论。");
});
