import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat shell exposes accessibility markers for live regions, tabs, focus, and keyboard submit", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  const css = await readFile("web/another_brain_chat/styles.css", "utf8");

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="status"/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(app, /focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.sr-only/);
});
