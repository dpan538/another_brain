import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  cardsToEvidenceRecords,
  collectToneHints,
  normalizeR28Rag3CardFixture,
  rankProfileCards
} from "../../src/browser_runtime/rag/profile_retriever.ts";

async function fixture(name) {
  return JSON.parse(await readFile(resolve(process.cwd(), `web/another_brain/static_rag/${name}`), "utf8"));
}

test("profile retriever normalizes cards into evidence records with provenance", async () => {
  const cards = normalizeR28Rag3CardFixture(await fixture("style_cards.json"));
  const records = cardsToEvidenceRecords(cards);
  assert.ok(records.some((record) => record.metadata.card_kind === "aesthetic"));
  for (const record of records) {
    assert.equal(record.metadata.private_raw_data, false);
    assert.equal(record.metadata.allowed_for_training, false);
    assert.ok(record.metadata.provenance);
    assert.ok(Array.isArray(record.metadata.tone_hints));
  }
});

test("profile retriever ranks affective style cards for aesthetic/value prompts", async () => {
  const cards = [
    ...normalizeR28Rag3CardFixture(await fixture("profile_cards.json")),
    ...normalizeR28Rag3CardFixture(await fixture("style_cards.json")),
    ...normalizeR28Rag3CardFixture(await fixture("boundary_cards.json"))
  ];
  const ranked = rankProfileCards("你会怎么判断审美问题", cards, { topK: 4, minScore: 0.01 });
  assert.ok(ranked.length > 0);
  assert.ok(ranked.some((item) => item.metadata.card_kind === "aesthetic"));
  const hints = collectToneHints(ranked);
  assert.ok(hints.length > 0);
  assert.ok(hints.includes("specific") || hints.includes("textured"));
});
