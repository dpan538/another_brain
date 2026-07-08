import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { normalizeProfileCardPack, validateProfileCards } from "../../src/browser_runtime/rag/profile_retriever.ts";

const CARD_FILES = [
  "profile_cards.json",
  "style_cards.json",
  "boundary_cards.json"
];

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadAllCards(root = process.cwd()) {
  const packs = await Promise.all(CARD_FILES.map((name) => readJson(resolve(root, "web/another_brain/static_rag", name))));
  return packs.flatMap((pack) => normalizeProfileCardPack(pack));
}

test("R28RAG3 static profile card files follow runtime card schema", async () => {
  const cards = await loadAllCards();
  const report = validateProfileCards(cards);
  assert.equal(report.ok, true, report.failures.join(", "));
  assert.equal(report.answer_bank, false);
  assert.equal(report.broad_answer_bank, false);
  assert.ok(report.card_count >= 12);
  assert.ok(report.card_count <= 20);
  for (const card of cards) {
    assert.equal(card.allowed_for_training, false, card.id);
    assert.equal(card.private_raw_data, false, card.id);
    assert.equal(card.review_status, "approved_for_runtime", card.id);
    assert.doesNotMatch(card.text, /\/Users\/|\.docx|\.pdf|raw checkpoint|private raw/i, card.id);
    assert.ok(!("answer" in card));
    assert.ok(!("final_answer" in card));
    assert.ok(!("question" in card));
  }
});

test("asset manifest declares every profile card asset with exact size", async () => {
  const root = process.cwd();
  const manifest = await readJson(resolve(root, "web/another_brain/asset_manifest.json"));
  const declared = new Map(manifest.rag_assets.map((item) => [basename(item.path), item]));
  for (const name of ["demo_memory.json", ...CARD_FILES]) {
    assert.ok(declared.has(name), `missing manifest rag asset: ${name}`);
    const item = declared.get(name);
    assert.equal(item.answer_bank, false);
    assert.equal(item.bytes, (await stat(resolve(root, "web", item.path))).size);
    assert.equal(item.path.startsWith("http"), false);
    if (CARD_FILES.includes(name)) {
      assert.equal(item.profile_context_pack, true);
      assert.equal(item.runtime_hints_only, true);
    }
  }
});
