import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("browser runtime exposes R28SHIP0 truth table status and blockers", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(runtime.includes("evaluateRuntimeTruth"));
  assert.ok(runtime.includes("fallback_source_requires_visible_blocker"));
  assert.ok(runtime.includes("asset_missing"));
  assert.ok(runtime.includes("tokenizer_fail"));
  assert.ok(runtime.includes("forward_timeout"));
  assert.ok(runtime.includes("worker_error"));
});
