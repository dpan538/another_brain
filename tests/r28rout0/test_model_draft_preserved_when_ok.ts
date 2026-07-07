import test from "node:test";
import assert from "node:assert/strict";
import { applyAnswerSurfacePolicy } from "../../src/browser_runtime/router/answer_surface_policy.ts";

test("valid model draft is preserved when evidence and output are acceptable", () => {
  const draft = "根据本地证据：another_brain 会先检索本地证据，再让静态 q4 生成草稿。";
  const result = applyAnswerSurfacePolicy({
    user_input: "another_brain 怎么回答？",
    evidence_status: "sufficient",
    runtime_mode: "static_q4_experimental",
    model_output: draft,
    decode_status: "exact_runtime_tokenizer",
    generation_flags: [],
    product_admission: false,
    evidence_packet: {
      evidence_status: "sufficient",
      answer_policy_hint: "answer",
      retrieved_evidence: [{ title: "local", text: "another_brain 会先检索本地证据。" }]
    }
  });
  assert.equal(result.route, "rag_grounded_answer");
  assert.equal(result.use_model_draft, true);
  assert.equal(result.fallback_used, false);
  assert.equal(result.final_answer, draft);
});
