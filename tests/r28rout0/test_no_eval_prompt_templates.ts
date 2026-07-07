import test from "node:test";
import assert from "node:assert/strict";
import { ANSWER_SURFACE_TEMPLATES } from "../../src/browser_runtime/router/answer_surfaces.ts";

test("answer-surface templates do not contain eval prompts or excluded question-pack rows", () => {
  const text = Object.values(ANSWER_SURFACE_TEMPLATES).join("\n").toLowerCase();
  for (const marker of ["eval prompt", "question_pack", "question pack", "rows 51", "row 51", "row 100", "hidden prompt"]) {
    assert.equal(text.includes(marker), false, marker);
  }
});
