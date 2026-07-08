import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("simple intents stay on the micro-intent fast path", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const matrix = await readFile(new URL("../../scripts/r28qa6_runtime_matrix.mjs", import.meta.url), "utf8");
  for (const text of ["你好", "你是谁", "你是鳄鱼吗", "你从哪里来", "你能做什么"]) {
    assert.ok(matrix.includes(text), text);
  }
  assert.ok(matrix.includes("maxMs: 300"));
  assert.ok(runtime.includes("micro_intent_fast_path"));
  assert.ok(runtime.includes("matchMicroIntent"));
  assert.ok(runtime.includes("MICRO_INTENT_EXAMPLES"));
});
