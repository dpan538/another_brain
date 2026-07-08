import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("P0C chat surface uses user-facing crocodile naming, not engineering brand", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  assert.ok(html.includes("<p class=\"eyebrow\">鳄鱼</p>"));
  assert.ok(html.includes("<h1 id=\"chat-title\">问吧。</h1>"));
  assert.ok(html.includes("<div class=\"message-role\">鳄鱼</div>"));
  assert.ok(!html.includes("<p class=\"eyebrow\">another_brain</p>"));
  assert.ok(!html.includes("<div class=\"message-role\">another_brain</div>"));
});

test("P0C chat mode hides model parameters from ordinary users", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const css = await readWeb("another_brain_chat/styles.css");

  assert.ok(html.includes("id=\"q4-status-badge\">q4 forward: not checked"));
  assert.ok(html.includes("id=\"model-source-badge\">static_q4_experimental"));
  assert.ok(html.includes("id=\"configured-model-mode\">static_q4_experimental"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .dashboard-only"));
  assert.ok(css.includes("display: none !important"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .header-badges"));
  assert.ok(css.includes("display: none;"));
});

test("P0C mobile composer keeps only one visible chat action", async () => {
  const css = await readWeb("another_brain_chat/styles.css");
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .composer-actions .button-secondary"));
  assert.ok(css.includes("display: none;"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .composer-actions {\n    grid-template-columns: 1fr;"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] #send-button"));
  assert.ok(css.includes("min-height: 52px"));
});

test("P0C chat layout is two cards and protected against horizontal overflow", async () => {
  const css = await readWeb("another_brain_chat/styles.css");
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .conversation-pane"));
  assert.ok(css.includes("border: 0;"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .message-list"));
  assert.ok(css.includes(".app-shell[data-ui-mode=\"chat\"] .composer"));
  assert.ok(css.includes("overflow-x: hidden"));
  assert.ok(css.includes("min-height: calc(100svh - 86px)"));
});
