import test from "node:test";
import assert from "node:assert/strict";
import { loadStaticRagAsset, loadStaticRagAssets, STATIC_RAG_DEFAULT_ASSETS } from "../../src/browser_runtime/rag/static_retriever.ts";

test("static RAG loader keeps same-origin profile card assets", async () => {
  const fixtures = new Map([
    ["demo_memory.json", { fixture_policy: { answer_bank: false }, records: [] }],
    ["profile_cards.json", { fixture_policy: { answer_bank: false, private_raw_data: false }, cards: [{
      id: "test-profile",
      kind: "identity",
      text: "Local identity runtime hint.",
      provenance: "approved_anchor_summary",
      allowed_for_training: false,
      private_raw_data: false,
      review_status: "approved_for_runtime",
      keywords: ["identity"],
      tone_hints: ["direct"]
    }] }],
    ["style_cards.json", { fixture_policy: { answer_bank: false, private_raw_data: false }, cards: [] }],
    ["boundary_cards.json", { fixture_policy: { answer_bank: false, private_raw_data: false }, cards: [] }]
  ]);
  const records = await loadStaticRagAssets({
    baseUrl: "https://example.test/another_brain_chat/",
    fetcher: async (url) => {
      const key = [...fixtures.keys()].find((name) => String(url).endsWith(name));
      return { ok: true, status: 200, json: async () => fixtures.get(key) };
    }
  });
  assert.equal(STATIC_RAG_DEFAULT_ASSETS.length, 4);
  assert.equal(records.length, 1);
  assert.equal(records[0].source_id, "test-profile");
  assert.equal(records[0].metadata.r28rag3_profile_card, true);
});

test("single static RAG asset loader still rejects external URLs", async () => {
  await assert.rejects(
    () => loadStaticRagAsset({
      assetUrl: "https://evil.test/profile_cards.json",
      baseUrl: "https://example.test/another_brain_chat/",
      fetcher: async () => ({ ok: true, status: 200, json: async () => ({ records: [] }) })
    }),
    /non_same_origin/
  );
});
