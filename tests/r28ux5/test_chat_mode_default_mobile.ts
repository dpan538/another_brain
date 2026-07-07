import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Chat Mode is the default shell and mobile keeps the compact chat surface", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.match(html, /id="app-shell"[^>]*data-ui-mode="chat"/);
  assert.ok(html.includes("id=\"chat-mode-button\""));
  assert.ok(html.includes("id=\"dashboard-mode-button\""));
  assert.ok(css.includes("@media (max-width: 720px)"));
  assert.ok(css.includes('.app-shell[data-ui-mode="chat"] .dashboard-only'));
  assert.ok(app.includes("function inferInitialMode()"));
  assert.ok(app.includes('return "chat";'));
});
