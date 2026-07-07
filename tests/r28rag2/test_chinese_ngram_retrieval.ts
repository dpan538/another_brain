import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMemoryIndex } from "../../src/browser_runtime/rag/static_memory_index.ts";
import { rankEvidence } from "../../src/browser_runtime/rag/rag_ranker.ts";

async function memoryRecords() {
  const index = JSON.parse(await readFile("web/another_brain/static_rag/memory_index.json", "utf8"));
  const registry = JSON.parse(await readFile("web/another_brain/static_rag/source_registry.json", "utf8"));
  return normalizeMemoryIndex(index, registry).records;
}

test("Chinese char ngram retrieval finds the lightweight RAG source record", async () => {
  const ranked = rankEvidence("轻量 RAG 来源怎么显示", await memoryRecords(), { topK: 3 });
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].record_id, "r28rag2-lightweight-rag");
  assert.ok(ranked[0].retrieval_score > 0.08);
});
