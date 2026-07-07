import test from "node:test";
import assert from "node:assert/strict";
import { StaticRetriever } from "../../src/browser_runtime/rag/static_retriever.ts";
import { runChatPipeline } from "../../src/browser_runtime/generation_loop.ts";

test("static retriever returns sufficient evidence for demo memory", async () => {
  const retriever = new StaticRetriever({
    records: [
      {
        source_id: "local-demo",
        title: "Static browser chat surface",
        text: "The browser chat surface retrieves local evidence packets before drafting.",
        trust_level: "high",
        license_or_origin: "synthetic demo fixture",
        can_answer: true,
        keywords: ["browser", "chat", "evidence", "drafting"]
      }
    ]
  });
  const packet = await retriever.retrieve("browser chat evidence");
  assert.equal(packet.evidence_status, "sufficient");
  assert.equal(packet.retrieved_evidence.length, 1);
});

test("chat pipeline includes evidence packet before verifier/fallback", async () => {
  const packet = await runChatPipeline("browser memory surface", { maxTokens: 8 });
  assert.equal(packet.state_packet.backend_inference, false);
  assert.equal(packet.evidence_packet.evidence_status, "sufficient");
  assert.equal(packet.retrieved_evidence.length, 1);
  assert.equal(packet.fallback_used, false);
});
