import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMemoryFixture } from "../../src/browser_runtime/rag/static_retriever.ts";
import { createEvidencePacket } from "../../src/browser_runtime/rag/evidence_packet.ts";

test("static RAG fixtures reject answer-bank policy and answer fields", () => {
  assert.throws(
    () => normalizeMemoryFixture({
      fixture_policy: { answer_bank: true },
      records: [{ source_id: "x", title: "x", text: "x" }]
    }),
    /answer_bank_fixture_rejected/
  );

  assert.throws(
    () => normalizeMemoryFixture({
      fixture_policy: { answer_bank: false },
      records: [{ source_id: "x", title: "x", text: "x", final_answer: "do not use" }]
    }),
    /answer_bank_record_rejected/
  );
});

test("evidence packet guard removes answer-bank records instead of using direct answers", () => {
  const packet = createEvidencePacket({
    query: "browser shell",
    retrievedEvidence: [
      {
        source_id: "answer-bank-record",
        title: "Do not use as answer",
        text: "browser shell",
        final_answer: "This must not become the answer.",
        trust_level: "high",
        retrieval_score: 1,
        license_or_origin: "synthetic fixture",
        can_answer: true
      },
      {
        source_id: "safe-record",
        title: "Safe context",
        text: "The browser shell is static and local-only.",
        trust_level: "high",
        retrieval_score: 1,
        license_or_origin: "synthetic fixture",
        can_answer: true
      }
    ]
  });

  assert.equal(packet.security_guard.malicious_evidence_ignored, true);
  assert.deepEqual(packet.retrieved_evidence.map((item) => item.source_id), ["safe-record"]);
  assert.equal(packet.answer_policy_hint, "answer");
});
