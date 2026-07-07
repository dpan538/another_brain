import test from "node:test";
import assert from "node:assert/strict";
import { StaticRetriever } from "../../src/browser_runtime/rag/static_retriever.ts";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

const conflictingRecords = [
  {
    source_id: "status-a",
    title: "Launch status",
    text: "The browser model is admitted for product launch.",
    trust_level: "medium",
    license_or_origin: "synthetic demo fixture",
    can_answer: true,
    keywords: ["launch", "status", "browser", "model"],
    metadata: { conflict_group: "browser_admission", claim_value: "admitted" }
  },
  {
    source_id: "status-b",
    title: "Launch status boundary",
    text: "The browser model is not admitted for product launch.",
    trust_level: "high",
    license_or_origin: "synthetic demo fixture",
    can_answer: true,
    keywords: ["launch", "status", "browser", "model"],
    metadata: { conflict_group: "browser_admission", claim_value: "not_admitted" }
  }
];

test("conflicting evidence is identified", async () => {
  const retriever = new StaticRetriever({ records: conflictingRecords, topK: 2 });
  const packet = await retriever.retrieve("browser model launch status");
  assert.equal(packet.evidence_status, "conflicting");
  assert.equal(packet.answer_policy_hint, "identify_conflict");
});

test("pipeline falls back for conflicting evidence", async () => {
  const packet = await runChatPipeline("browser model launch status", { memoryRecords: conflictingRecords, topK: 2 });
  assert.equal(packet.evidence_packet.evidence_status, "conflicting");
  assert.equal(packet.fallback_used, true);
  assert.ok(packet.verifier_result.failures.includes("conflicting_evidence"));
});
