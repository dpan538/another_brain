import test from "node:test";
import assert from "node:assert/strict";
import { loadStaticRagAsset } from "../../src/browser_runtime/rag/static_retriever.ts";

test("same-origin RAG asset loader accepts declared static path", async () => {
  const fixture = { fixture_policy: { answer_bank: false }, records: [] };
  const records = await loadStaticRagAsset({
    assetUrl: "../another_brain/static_rag/demo_memory.json",
    baseUrl: "https://example.test/another_brain_chat/",
    fetcher: async () => ({ ok: true, status: 200, json: async () => fixture })
  });
  assert.deepEqual(records, []);
});

test("same-origin RAG asset loader rejects external path", async () => {
  await assert.rejects(
    () => loadStaticRagAsset({
      assetUrl: "https://evil.test/static_rag/demo_memory.json",
      baseUrl: "https://example.test/another_brain_chat/",
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ records: [] }) })
    }),
    /non_same_origin/
  );
});
