import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("natural answer surfaces retain compact length policy for open/value questions", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const qa = await readFile(new URL("../../scripts/r28qa6_runtime_matrix.mjs", import.meta.url), "utf8");
  assert.ok(runtime.includes("SURFACE_LENGTH_POLICY"));
  assert.ok(runtime.includes("r28surf5-answer-length-policy-v1"));
  assert.ok(runtime.includes("max_chars: 160"));
  assert.ok(runtime.includes("q4_accepted_open_answer"));
  assert.ok(qa.includes('maxChars: 160'));
  assert.ok(qa.includes("relation_surface_cross_contamination"));
});
