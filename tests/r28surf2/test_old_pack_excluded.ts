import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("old question_pack_001 rows 51-100 remain excluded from SURF2 surfaces", async () => {
  const summary = JSON.parse(await readFile(new URL("../../data/training_registry/r28surf2_anchor_surface_summary.json", import.meta.url), "utf8"));
  assert.equal(summary.old_pack_51_100_excluded, true);
  assert.equal(summary.source_policy.old_question_pack_001_rows_51_100_used, false);

  const files = [
    "../../src/browser_runtime/router/r28surf2_intents.ts",
    "../../src/browser_runtime/router/r28surf2_surface_composer.ts",
    "../../src/browser_runtime/router/r28surf2_surface_fragments.ts"
  ];
  for (const file of files) {
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /question_pack_001|rows 51-100/i, file);
  }
});
