import test from "node:test";
import assert from "node:assert/strict";
import { SURFACE_FRAGMENTS } from "../../src/browser_runtime/router/surface_fragments.ts";

test("surface fragments do not contain eval prompt or old question-pack markers", () => {
  const joined = Object.values(SURFACE_FRAGMENTS).flat().join("\n").toLowerCase();
  for (const marker of ["eval prompt", "question_pack", "row 51", "row 100", "old question_pack"]) {
    assert.equal(joined.includes(marker), false, marker);
  }
});
