import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("demo memory fixture is not an answer bank", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../demo_memory.json", import.meta.url), "utf8"));
  assert.equal(fixture.fixture_policy.answer_bank, false);
  for (const record of fixture.records) {
    assert.equal("answer" in record, false);
    assert.equal("answer_text" in record, false);
    assert.equal("final_answer" in record, false);
    assert.equal("prompt" in record, false);
  }
});
