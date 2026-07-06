import test from "node:test";
import assert from "node:assert/strict";
import { StaticRetriever } from "../../src/browser_runtime/rag/static_retriever.ts";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

test("empty retrieval returns insufficient evidence", async () => {
  const retriever = new StaticRetriever({ records: [] });
  const packet = await retriever.retrieve("unknown topic");
  assert.equal(packet.evidence_status, "insufficient");
  assert.equal(packet.answer_policy_hint, "ask_clarifying");
});

test("pipeline falls back when evidence is insufficient", async () => {
  const packet = await runChatPipeline("unknown topic", { memoryRecords: [], maxTokens: 8 });
  assert.equal(packet.evidence_packet.evidence_status, "insufficient");
  assert.equal(packet.fallback_used, true);
  assert.ok(packet.verifier_result.failures.includes("empty_evidence"));
});
