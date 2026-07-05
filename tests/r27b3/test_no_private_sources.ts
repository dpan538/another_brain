import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("demo RAG fixture declares safe source boundaries", async () => {
  const text = await readFile(new URL("../../demo_memory.json", import.meta.url), "utf8");
  const fixture = JSON.parse(text);
  assert.equal(fixture.fixture_policy.private_raw_data, false);
  assert.equal(fixture.fixture_policy.eval_prompts, false);
  assert.equal(fixture.fixture_policy.old_question_pack_rows_51_100, false);
  assert.equal(/question_pack_001|rows?\s*51|eval prompt|data\/public_ingestion|\.docx|\.pdf/i.test(text), false);
});
