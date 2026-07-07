import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("token-id-only or low-quality model output routes to model gibberish fallback", () => {
  const result = applyAnswerSurfacePolicy({
    user_input: "本地模型乱码怎么办？",
    evidence_status: "sufficient",
    runtime_mode: "static_q4_experimental",
    model_output: "token_id:11 token_id:12",
    decode_status: "exact_runtime_tokenizer",
    generation_flags: ["bad_token_suppressed"],
    product_admission: false,
    evidence_packet: { evidence_status: "sufficient", retrieved_evidence: [{ title: "local", text: "本地证据可用。" }] }
  });
  assert.equal(result.route, "model_gibberish_fallback");
  assert.equal(result.use_model_draft, false);
  assert.equal(result.fallback_reason, "bad_token_suppressed");
  assert.equal(result.final_answer, "本地模型这次输出不稳定，我先给出基于证据和边界的保守回答。");
  assert.ok(!result.final_answer.includes("token_id:"));
});
