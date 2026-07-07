import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("deep self-check has timeout and restores controls", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.ok(app.includes("timeoutMs: 8000"));
  assert.ok(runtime.includes("self_check_timeout"));
  assert.ok(app.includes("finally"));
  assert.ok(app.includes("setDisabled(modelSelfCheckButton, false)"));
  assert.ok(app.includes("setDisabled(modelSelfCheckStopButton, true)"));
});
