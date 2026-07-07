import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("conflicting evidence routes to a conflict boundary", () => {
  const result = applyAnswerSurfacePolicy({
    user_input: "browser admission 状态是什么？",
    evidence_status: "conflicting",
    runtime_mode: "static_q4_experimental",
    model_output: "可以上线。",
    decode_status: "exact_runtime_tokenizer",
    generation_flags: [],
    product_admission: false
  });
  assert.equal(result.route, "conflicting_evidence_boundary");
  assert.equal(result.use_model_draft, false);
  assert.equal(result.fallback_reason, "conflicting_evidence");
  assert.equal(result.final_answer, "现有证据之间有冲突，我不能直接合并成一个确定答案。");
});
