import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("boot model path self-check stays quick while composer waits for full q4 mount", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("runtime.quickSelfCheckModelPath({"));
  assert.ok(app.includes("jsonTimeoutMs: 900"));
  assert.ok(app.includes("shardTimeoutMs: 900"));
  assert.ok(app.includes("q4_forward: { status: \"skipped\""));
  assert.ok(app.includes("boot().catch"));
  assert.ok(app.includes("runtime.mountQ4WithRetry({"));
  assert.ok(app.includes("timeoutMs: R28P0_Q4_WARMUP_TIMEOUT_MS"));
  assert.ok(app.includes("const R28P0_Q4_WARMUP_TIMEOUT_MS = 90000"));
  assert.ok(app.includes("setModelFullyLoaded(false)"));
  assert.ok(app.includes("setDisabled(input, !modelFullyLoaded)"));
  assert.ok(app.includes("q4_mount_required_before_chat"));
  assert.equal(app.includes("setDisabled(form"), false);
  assert.ok(app.includes("if (running) return"));
});
