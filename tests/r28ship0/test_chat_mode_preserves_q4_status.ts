import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat mode keeps q4 and retry status visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(html.includes("id=\"q4-status-badge\""));
  assert.ok(html.includes("id=\"q4-retry-status\""));
  assert.ok(app.includes("正在重试模型加载"));
  assert.ok(app.includes("q4 forward:"));
});
