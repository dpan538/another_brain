import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";

test("GEN1 finalizer gives stable Chinese fallback for conflicting evidence", () => {
  const finalized = finalizeAnswerSurface({
    input: "到底是哪一个？",
    draft: "随便选一个",
    generation: { tokens: ["随便", "选"] },
    evidencePacket: {
      evidence_status: "conflicting",
      answer_policy_hint: "identify_conflict",
      retrieved_evidence: [
        { source_id: "a", title: "证据 A", text: "状态是 A", trust_level: "medium" },
        { source_id: "b", title: "证据 B", text: "状态是 B", trust_level: "medium" }
      ]
    },
    verifierResult: { passed: false, failures: ["conflicting_evidence"] }
  });
  assert.equal(finalized.fallback_used, true);
  assert.equal(finalized.fallback_reason, "conflicting_evidence");
  assert.equal(finalized.answer_route, "conflicting_evidence_boundary");
  assert.equal(finalized.final_answer, "现有证据之间有冲突，我不能直接合并成一个确定答案。");
});
