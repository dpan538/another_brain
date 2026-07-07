import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface, looksLikeGibberish } from "../../src/browser_runtime/finalizer_adapter.ts";

test("gibberish output is replaced by deterministic answer boundary", () => {
  assert.equal(looksLikeGibberish("����"), true);
  const finalized = finalizeAnswerSurface({
    input: "你好",
    draft: "����",
    evidencePacket: {
      evidence_status: "sufficient",
      answer_policy_hint: "answer",
      retrieved_evidence: [{ title: "local", text: "可用证据" }]
    },
    verifierResult: { passed: true, failures: [] },
    generation: { needs_fallback: true, fallback_reason: "gibberish_output" }
  });
  assert.equal(finalized.fallback_used, true);
  assert.equal(finalized.answer_status, "deterministic_fallback");
  assert.match(finalized.final_answer, /静态小模型输出不稳定|确定性回答边界/);
});
