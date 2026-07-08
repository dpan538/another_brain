import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("desktop dashboard mode is retained behind an explicit toggle", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("mode-chat-button"));
  assert.ok(html.includes("mode-dashboard-button"));
  assert.ok(html.includes("Dashboard Mode 过程摘要"));
  assert.ok(html.includes("检查本地模型路径"));
  assert.ok(css.includes('.app-shell[data-ui-mode="dashboard"]'));
  assert.ok(css.includes('.app-shell[data-ui-mode="dashboard"] .chat-only'));
  assert.ok(app.includes('on(modeChatButton, "click", () => setUIMode("chat"))'));
  assert.ok(app.includes('on(modeDashboardButton, "click", () => setUIMode("dashboard"))'));
});
