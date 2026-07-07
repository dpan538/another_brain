import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateR28Rag3Card } from "../../src/browser_runtime/rag/profile_retriever.ts";

const cardFiles = [
  "web/another_brain/static_rag/profile_cards.json",
  "web/another_brain/static_rag/style_cards.json",
  "web/another_brain/static_rag/boundary_cards.json"
];

async function loadCards() {
  const cards = [];
  for (const file of cardFiles) {
    const fixture = JSON.parse(await readFile(resolve(process.cwd(), file), "utf8"));
    assert.equal(fixture.fixture_policy.runtime_hints_only, true, file);
    assert.equal(fixture.fixture_policy.answer_bank, false, file);
    assert.equal(fixture.fixture_policy.private_raw_data, false, file);
    cards.push(...fixture.cards);
  }
  return cards;
}

test("R28RAG3 profile pack cards satisfy runtime-only schema", async () => {
  const cards = await loadCards();
  assert.ok(cards.length >= 8);
  for (const card of cards) {
    const validation = validateR28Rag3Card(card);
    assert.equal(validation.ok, true, `${card.id}: ${validation.failures.join(",")}`);
    assert.equal(card.allowed_for_training, false);
    assert.equal(card.private_raw_data, false);
    assert.equal(card.review_status, "approved_for_runtime");
  }
});

test("R28RAG3 cards avoid answer-bank, eval, old-row, and private markers", async () => {
  const text = JSON.stringify(await loadCards()).toLowerCase();
  for (const marker of [
    "question_pack_001",
    "rows 51-100",
    "eval prompt",
    "hidden prompt",
    "chain-of-thought",
    "raw private",
    "private_sources/",
    "data/public_ingestion",
    ".docx",
    ".pdf"
  ]) {
    assert.equal(text.includes(marker), false, marker);
  }
  assert.equal(/"answer"\s*:|"final_answer"\s*:|"answer_text"\s*:/.test(text), false);
});
