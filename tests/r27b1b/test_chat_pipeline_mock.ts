import test from "node:test";
import assert from "node:assert/strict";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

test("mock chat pipeline returns final answer without fallback", async () => {
  const packet = await runChatPipeline("tell me about local memory", { mode: "synthetic_tiny", maxTokens: 8 });
  assert.equal(packet.state_packet.backend_inference, false);
  assert.equal(packet.retrieved_evidence.length, 1);
  assert.equal(packet.fallback_used, false);
  assert.ok(packet.final_answer.includes("Static browser draft"));
});
