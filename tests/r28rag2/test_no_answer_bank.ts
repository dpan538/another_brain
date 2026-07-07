import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28RAG2 static memory does not contain answer-bank fields", async () => {
  const index = JSON.parse(await readFile("web/another_brain/static_rag/memory_index.json", "utf8"));
  assert.equal(index.index_policy.answer_bank, false);
  const forbidden = ["answer", "final_answer", "answer_text", "template_answer"];
  for (const record of index.records) {
    for (const key of forbidden) assert.equal(Object.hasOwn(record, key), false, `${record.record_id}:${key}`);
  }
});
