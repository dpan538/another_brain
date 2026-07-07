import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMemoryIndex } from "../../src/browser_runtime/rag/static_memory_index.ts";
import { buildStaticEvidencePacket } from "../../src/browser_runtime/rag/static_retriever.ts";

async function records() {
  const index = JSON.parse(await readFile("web/another_brain/static_rag/memory_index.json", "utf8"));
  const registry = JSON.parse(await readFile("web/another_brain/static_rag/source_registry.json", "utf8"));
  return normalizeMemoryIndex(index, registry).records;
}

test("sufficient evidence is classified for local pipeline questions", async () => {
  const packet = await buildStaticEvidencePacket("another_brain 本地 pipeline q4 router finalizer", null, { topK: 3, memoryRecords: await records() });
  assert.equal(packet.evidence_status, "sufficient");
  assert.equal(packet.answer_policy_hint, "answer_with_evidence");
  assert.ok(packet.retrieved_evidence.length > 0);
});
