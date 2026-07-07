import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model self-check is visible and updates runtime status fields", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  for (const marker of ["检查本地模型路径", "self-check-tokens", "self-check-runtime-mode", "self-check-answer-source", "self-check-fallback-reason"]) {
    assert.ok(html.includes(marker));
  }
  assert.ok(app.includes("runtime.selfCheckModelPath()"));
  assert.ok(app.includes("q4_ready"));
  assert.ok(app.includes("q4_blocked"));
});
