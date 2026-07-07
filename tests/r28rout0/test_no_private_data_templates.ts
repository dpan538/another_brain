import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_SURFACE_TEMPLATES } from "../../src/browser_runtime/router/answer_surfaces.ts";

test("answer-surface templates do not embed private data or secrets", () => {
  const text = Object.values(ANSWER_SURFACE_TEMPLATES).join("\n").toLowerCase();
  for (const marker of ["api key", "password", "secret", "raw private", "@gmail", "phone", "token="]) {
    assert.equal(text.includes(marker), false, marker);
  }
});
