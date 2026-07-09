import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Chat defaults, Dashboard toggle, and runtime status are visible without hidden prompt UI", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");

  assert.ok(html.includes('data-ui-mode="chat"'));
  assert.ok(html.includes("chat-mode-button"));
  assert.ok(html.includes("dashboard-mode-button"));
  assert.ok(html.includes("local/static"));
  assert.ok(html.includes("not product"));
  assert.ok(html.includes("q4-status-badge"));
  assert.ok(html.includes("tokenizer-status-badge"));
  assert.ok(app.includes("setUiMode"));
  assert.ok(css.includes('.app-shell[data-ui-mode="chat"] .dashboard-only'));
  assert.equal(/hidden\s+prompt/i.test(html), false);
  assert.equal(/chain-of-thought/i.test(html), false);
});
