import test from "node:test";
import assert from "node:assert/strict";
import { R28SURF4_NATURAL_SURFACE_VARIANTS } from "../../src/browser_runtime/router/natural_surfaces.ts";

test("natural surfaces do not contain eval prompt leakage", () => {
  const joined = Object.values(R28SURF4_NATURAL_SURFACE_VARIANTS).flat().join("\n").toLowerCase();
  for (const marker of ["eval prompt", "heldout", "question_pack", "row 51", "row 100"]) {
    assert.ok(!joined.includes(marker), marker);
  }
});
