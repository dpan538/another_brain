import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";

const sufficientEvidence = {
  evidence_status: "sufficient",
  answer_policy_hint: "answer",
  retrieved_evidence: [{ source_id: "local", title: "Local note", text: "The answer should be concise.", trust_level: "high" }]
};

test("GEN1 finalizer keeps successful answers Chinese-first and non-admitted", () => {
  const finalized = finalizeAnswerSurface({
    input: "请回答",
    draft: "The local note says the response should be concise.",
    generation: { tokens: ["The", "local", "note"], quality_status: "not_assessed" },
    evidencePacket: sufficientEvidence,
    verifierResult: { passed: true, failures: [] }
  });
  assert.equal(finalized.fallback_used, false);
  assert.match(finalized.final_answer, /^根据当前本地证据：/);
  assert.equal(finalized.chinese_first, true);
  assert.equal(finalized.product_admission, false);
  assert.equal(finalized.browser_admission, false);
  assert.equal(finalized.release_checkpoint_admission, false);
});
