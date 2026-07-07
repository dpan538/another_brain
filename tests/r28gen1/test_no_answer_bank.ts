import test from "node:test";
import assert from "node:assert/strict";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";
import { buildPromptPacket, buildStatePacket } from "../../src/browser_runtime/rag_packet.ts";

test("GEN1 prompt and finalizer do not create an answer bank", () => {
  const evidencePacket = {
    evidence_status: "sufficient",
    answer_policy_hint: "answer",
    retrieved_evidence: [{ source_id: "local", title: "事实", text: "这是证据，不是答案库。", trust_level: "high" }]
  };
  const promptPacket = buildPromptPacket("问题", buildStatePacket("问题"), evidencePacket);
  assert.equal(promptPacket.evidence_packet.answer_bank, false);
  assert.equal("final_answer" in promptPacket.evidence_packet.retrieved_evidence[0], false);

  const finalized = finalizeAnswerSurface({
    input: "问题",
    draft: "证据说明：这是本地证据。",
    generation: { tokens: ["证据说明"] },
    evidencePacket,
    verifierResult: { passed: true, failures: [] }
  });
  assert.equal(finalized.no_answer_bank, true);
  assert.equal(finalized.product_admission, false);
});
