import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28RAG2 assets stay public-safe and avoid excluded private surfaces", async () => {
  const combined = [
    await readFile("web/another_brain/static_rag/memory_index.json", "utf8"),
    await readFile("web/another_brain/static_rag/source_registry.json", "utf8")
  ].join("\n");
  for (const forbidden of [
    "data/public_ingestion",
    "question_pack_001 rows 51",
    "old question_pack_001 rows 51",
    ".docx",
    ".pdf",
    "raw private data",
    "api key",
    "password"
  ]) {
    assert.equal(combined.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});
