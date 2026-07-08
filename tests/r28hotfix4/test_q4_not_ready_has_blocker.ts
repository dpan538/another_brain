import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync("web/another_brain_chat/browser_runtime.js", "utf8");

test("q4-not-ready open question fallback exposes a specific blocker", () => {
  assert.match(runtime, /q4GenerationBlocker\(\)/);
  for (const blocker of ["q4_assets_unavailable", "tokenizer_unavailable", "worker_unavailable", "q4_forward_timeout"]) {
    assert.match(runtime, new RegExp(blocker));
  }
  assert.match(runtime, /fallbackReason:\s*blocker/);
  assert.match(runtime, /q4_attempted:\s*false/);
});
