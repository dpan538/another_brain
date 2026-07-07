import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";

const sufficientEvidence = {
  evidence_status: "sufficient",
  answer_policy_hint: "answer",
  retrieved_evidence: [{ source_id: "local", title: "本地证据", text: "回答要简洁准确。", trust_level: "high" }]
};

test("GEN1 finalizer falls back for token-id-only or low-confidence output", () => {
  const tokenIdOnly = finalizeAnswerSurface({
    input: "你好",
    draft: "token_id:11 token_id:12",
    generation: { tokens: ["token_id:11", "token_id:12"], quality_status: "not_assessed" },
    evidencePacket: sufficientEvidence,
    verifierResult: { passed: true, failures: [] }
  });
  assert.equal(tokenIdOnly.fallback_used, true);
  assert.equal(tokenIdOnly.fallback_reason, "bad_token_suppressed");
  assert.match(tokenIdOnly.final_answer, /确定性 fallback|静态 q4 输出不够稳定/);

  const lowConfidence = finalizeAnswerSurface({
    input: "你好",
    draft: "commit square square",
    generation: { tokens: ["commit", "square"], quality_status: "quality_not_ready" },
    evidencePacket: sufficientEvidence,
    verifierResult: { passed: true, failures: [] }
  });
  assert.equal(lowConfidence.fallback_used, true);
  assert.equal(lowConfidence.fallback_reason, "low_confidence_gibberish");
});
