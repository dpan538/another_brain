import test from "node:test";
import assert from "node:assert/strict";
import { createEvidencePacket } from "../../src/browser_runtime/rag/evidence_packet.ts";
import { validateEvidencePacket } from "../../src/browser_runtime/rag/retrieval_schema.ts";

test("retrieval schema validates evidence packet shape", () => {
  const packet = createEvidencePacket({
    query: "browser memory",
    retrievedEvidence: [
      {
        source_id: "demo",
        title: "Demo",
        text: "Local browser memory evidence.",
        trust_level: "high",
        retrieval_score: 0.8,
        license_or_origin: "synthetic demo fixture",
        can_answer: true
      }
    ]
  });
  const result = validateEvidencePacket(packet);
  assert.equal(result.ok, true);
  assert.equal(packet.evidence_status, "sufficient");
  assert.equal(packet.answer_policy_hint, "answer");
});
