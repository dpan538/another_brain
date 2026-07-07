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

test("unrelated queries classify as insufficient evidence", async () => {
  const packet = await buildStaticEvidencePacket("火星花园菜单价格", null, { topK: 3, memoryRecords: await records() });
  assert.equal(packet.evidence_status, "insufficient");
  assert.equal(packet.answer_policy_hint, "ask_clarifying");
});
