import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat mode is the default user surface", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes('data-ui-mode="chat"'));
  assert.ok(html.includes('class="conversation-pane chat-surface"'));
  assert.ok(html.includes('class="chat-status-strip chat-only"'));
  assert.ok(html.includes('class="status-grid dashboard-only"'));
  assert.ok(css.includes('.app-shell[data-ui-mode="chat"] .dashboard-only'));
  assert.ok(css.includes('.app-shell[data-ui-mode="chat"] .workspace-grid'));
  assert.ok(app.includes('setUIMode("chat")'));
});
