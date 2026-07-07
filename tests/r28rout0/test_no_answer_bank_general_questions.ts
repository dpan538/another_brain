import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("router does not answer arbitrary general questions from templates", () => {
  const result = applyAnswerSurfacePolicy({
    user_input: "巴黎是不是法国首都？",
    evidence_status: "insufficient",
    runtime_mode: "static_q4_experimental",
    model_output: "巴黎是法国首都。",
    decode_status: "exact_runtime_tokenizer",
    generation_flags: [],
    product_admission: false
  });
  assert.equal(result.route, "insufficient_evidence_boundary");
  assert.equal(result.use_model_draft, false);
  assert.equal(result.final_answer, "目前证据不足，我不能把这个判断说成确定结论。");
  assert.ok(!result.final_answer.includes("巴黎"));
  assert.ok(result.non_claims.includes("hard router is product-surface guard only"));
});
