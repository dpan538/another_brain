import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("self-check does not run heavy q4 smoke during boot", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("runtime.quickSelfCheckModelPath({ timeoutMs: 1000 })"));
  assert.equal(app.includes("runtime.selfCheckModelPath();"), false);
  assert.ok(app.includes("q4_forward: { status: \"skipped\""));
  assert.equal(app.includes("setDisabled(input"), false);
  assert.equal(app.includes("setDisabled(form"), false);
});
