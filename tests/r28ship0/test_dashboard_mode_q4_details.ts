import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("dashboard exposes q4 attempts, blockers, runtime mode, and fallback reason", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  for (const id of [
    "self-check-q4",
    "self-check-runtime-mode",
    "self-check-answer-source",
    "self-check-fallback-reason",
    "q4-retry-status"
  ]) {
    assert.ok(html.includes(`id=\"${id}\"`));
  }
  assert.ok(app.includes("renderQ4RetryStatus"));
  assert.ok(app.includes("fallback reason"));
});
