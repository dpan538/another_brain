import test from "node:test";
import assert from "node:assert/strict";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

test("insufficient evidence finalizer says evidence is insufficient", async () => {
  const packet = await runChatPipeline("未知主题", { memoryRecords: [], maxTokens: 8 });
  assert.equal(packet.evidence_packet.evidence_status, "insufficient");
  assert.equal(packet.fallback_used, true);
  assert.equal(packet.reason, "insufficient_evidence");
  assert.match(packet.final_answer, /证据不足/);
  assert.equal(packet.surface_policy.no_answer_bank, true);
});
