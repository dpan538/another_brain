import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ProfileRetriever,
  loadProfileCardAsset,
  normalizeProfileCardPack,
  validateProfileCards
} from "../../src/browser_runtime/rag/profile_retriever.ts";

async function loadCards() {
  const names = ["profile_cards.json", "style_cards.json", "boundary_cards.json"];
  const packs = await Promise.all(names.map(async (name) =>
    JSON.parse(await readFile(resolve(process.cwd(), "web/another_brain/static_rag", name), "utf8"))
  ));
  return packs.flatMap((pack) => normalizeProfileCardPack(pack));
}

test("profile retriever ranks identity, style, boundary and aesthetic cards", async () => {
  const retriever = new ProfileRetriever({ cards: await loadCards(), topK: 4 });
  const identity = retriever.retrieveCards("你是谁，你是鳄鱼吗？");
  assert.equal(identity[0].kind, "identity");
  assert.equal(identity[0].provenance, "approved_anchor_summary");
  assert.ok(identity[0].retrieval_score > 0.2);

  const style = retriever.retrieveCards("回答风格不要客服腔，要短一点。");
  assert.equal(style[0].kind, "style");

  const boundary = retriever.retrieveEvidence("证据不足或者不接后端时怎么办？");
  assert.ok(boundary.some((item) => item.metadata.kind === "boundary"));
  assert.ok(boundary.every((item) => item.metadata.profile_card === true));
  assert.ok(boundary.every((item) => item.metadata.allowed_for_training === false));

  const aesthetic = retriever.retrieveCards("你能表达审美判断吗？");
  assert.ok(aesthetic.some((card) => card.kind === "aesthetic" || card.kind === "value"));
});

test("profile card loader accepts same-origin static_rag assets and rejects remote assets", async () => {
  const fixture = {
    fixture_policy: { answer_bank: false },
    cards: [
      {
        id: "same_origin_profile_card",
        kind: "style",
        text: "风格提示：短答。",
        provenance: "demo_safe",
        allowed_for_training: false,
        private_raw_data: false,
        review_status: "approved_for_runtime"
      }
    ]
  };
  const cards = await loadProfileCardAsset({
    assetUrl: "../another_brain/static_rag/profile_cards.json",
    baseUrl: "https://example.test/another_brain_chat/",
    fetcher: async () => ({ ok: true, status: 200, json: async () => fixture })
  });
  assert.equal(validateProfileCards(cards).ok, true);
  await assert.rejects(
    () => loadProfileCardAsset({
      assetUrl: "https://evil.test/static_rag/profile_cards.json",
      baseUrl: "https://example.test/another_brain_chat/",
      fetcher: async () => ({ ok: true, status: 200, json: async () => fixture })
    }),
    /non_same_origin/
  );
});
