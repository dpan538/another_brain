import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CARD_FILES = ["profile_cards.json", "style_cards.json", "boundary_cards.json"];

test("profile card packs are not a broad answer bank", async () => {
  let totalCards = 0;
  for (const name of CARD_FILES) {
    const pack = JSON.parse(await readFile(resolve(process.cwd(), "web/another_brain/static_rag", name), "utf8"));
    assert.equal(pack.fixture_policy.answer_bank, false, name);
    assert.equal(pack.fixture_policy.allowed_for_training, false, name);
    assert.equal(pack.fixture_policy.private_raw_data, false, name);
    assert.equal(pack.fixture_policy.eval_prompts, false, name);
    assert.equal(pack.fixture_policy.old_question_pack_rows_51_100, false, name);
    for (const card of pack.cards) {
      totalCards += 1;
      assert.ok(!("answer" in card), card.id);
      assert.ok(!("final_answer" in card), card.id);
      assert.ok(!("answer_text" in card), card.id);
      assert.ok(!("question" in card), card.id);
      assert.ok(card.text.length < 100, card.id);
    }
  }
  assert.ok(totalCards <= 20);
});

test("R28RAG3 runtime files do not add backend or external model surfaces", async () => {
  const files = [
    "src/browser_runtime/rag/profile_retriever.ts",
    "src/browser_runtime/rag/expressive_rag.ts",
    "web/another_brain_chat/static_retriever.js",
    "web/another_brain_chat/browser_runtime.js"
  ];
  for (const file of files) {
    const text = await readFile(resolve(process.cwd(), file), "utf8");
    assert.doesNotMatch(text, /api\.openai\.com|dashscope|volces|pinecone|weaviate|qdrant\.cloud|@vercel\/blob/i, file);
    assert.doesNotMatch(text, /new WebSocket|XMLHttpRequest/i, file);
  }
});
