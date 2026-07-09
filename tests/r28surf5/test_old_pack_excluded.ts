import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("R28SURF5 style profile excludes old pack rows 51-100", () => {
  const profile = JSON.parse(readFileSync(new URL("../../data/training_registry/r28surf5_style_profile.json", import.meta.url), "utf8"));
  assert.equal(profile.old_pack_51_100_excluded, true);
  assert.equal(profile.source_policy.old_question_pack_001_rows_51_100_used, false);
});
