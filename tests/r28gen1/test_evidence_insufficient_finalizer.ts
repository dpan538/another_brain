import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";

test("GEN1 finalizer gives stable Chinese fallback for insufficient evidence", () => {
  const finalized = finalizeAnswerSurface({
    input: "这个本地事实是什么？",
    draft: "模型猜测答案",
    generation: { tokens: ["模型", "猜测", "答案"] },
    evidencePacket: {
      evidence_status: "insufficient",
      answer_policy_hint: "ask_clarifying",
      retrieved_evidence: []
    },
    verifierResult: { passed: false, failures: ["insufficient_evidence"] }
  });
  assert.equal(finalized.fallback_used, true);
  assert.equal(finalized.fallback_reason, "insufficient_evidence");
  assert.equal(finalized.answer_route, "insufficient_evidence_boundary");
  assert.equal(finalized.final_answer, "目前证据不足，我不能把这个判断说成确定结论。");
  assert.equal(finalized.no_answer_bank, true);
});
