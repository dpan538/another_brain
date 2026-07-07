import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMemoryIndex, validateStaticMemoryIndex } from "../../src/browser_runtime/rag/static_memory_index.ts";

async function loadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("static memory index and source registry normalize with provenance", async () => {
  const index = await loadJson("web/another_brain/static_rag/memory_index.json");
  const registry = await loadJson("web/another_brain/static_rag/source_registry.json");
  const validation = validateStaticMemoryIndex(index, registry);
  assert.equal(validation.ok, true);
  assert.equal(validation.answer_bank, false);
  assert.equal(validation.private_raw_data, false);
  assert.ok(validation.record_count >= 6);

  const normalized = normalizeMemoryIndex(index, registry);
  assert.ok(normalized.records.every((record) => record.allowed_for_training === false));
  assert.ok(normalized.records.every((record) => record.provenance));
  assert.ok(normalized.records.every((record) => record.review_status === "reviewed_demo_safe"));
});
