import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("boot model path self-check stays quick and does not freeze the composer", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("runtime.quickSelfCheckModelPath({"));
  assert.ok(app.includes("jsonTimeoutMs: 1500"));
  assert.ok(app.includes("shardTimeoutMs: 8000"));
  assert.ok(app.includes("q4_forward: { status: \"skipped\""));
  assert.ok(app.includes("boot().catch"));
  assert.equal(app.includes("runtime.deepSelfCheckModelPath({\n      timeoutMs: 15000"), true);
  assert.equal(app.includes("setDisabled(input"), false);
  assert.equal(app.includes("setDisabled(form"), false);
  assert.ok(app.includes("if (running) return"));
});
