import test from "node:test";
import assert from "node:assert/strict";
import { buildGenerationPrompt } from "../../src/browser_runtime/generation_prompt.ts";
import { finalizeAnswerSurface } from "../../src/browser_runtime/finalizer_adapter.ts";

test("prompt packet does not expose answer-bank fields", () => {
  const { packet, prompt } = buildGenerationPrompt("问题", {
    evidence_status: "sufficient",
    answer_policy_hint: "answer",
    retrieved_evidence: [
      {
        source_id: "e1",
        title: "Evidence",
        text: "事实线索，不是标准答案。",
        final_answer: "SHOULD_NOT_APPEAR"
      }
    ]
  });
  assert.equal(packet.output_policy.no_answer_bank, true);
  assert.equal(prompt.includes("SHOULD_NOT_APPEAR"), false);
  assert.equal(prompt.includes("final_answer"), false);
});

test("finalizer surface policy keeps no-answer-bank boundary", () => {
  const finalized = finalizeAnswerSurface({
    input: "问题",
    draft: "Static browser draft: 本地证据说明了边界。",
    evidencePacket: { evidence_status: "sufficient", answer_policy_hint: "answer", retrieved_evidence: [{ text: "边界" }] },
    verifierResult: { passed: true, failures: [] },
    generation: { needs_fallback: false }
  });
  assert.equal(finalized.fallback_used, false);
  assert.equal(finalized.surface_policy.no_answer_bank, true);
  assert.equal(finalized.surface_policy.no_private_fact_fabrication, true);
});
