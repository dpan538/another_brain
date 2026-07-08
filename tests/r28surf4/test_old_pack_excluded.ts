import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("style profile excludes old question_pack_001 rows 51-100", async () => {
  const profile = JSON.parse(await readFile(new URL("../../data/training_registry/r28surf4_style_profile.json", import.meta.url), "utf8"));
  assert.equal(profile.excluded_old_pack_51_100, true);
  assert.equal(profile.source_policy.old_question_pack_001_rows_51_100_used, false);
  assert.ok((profile.tracked_manifest_inputs || []).every((item) => !String(item).includes("question_pack_001")));
});
