import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("Chat mode does not expose a fast or lightweight fallback choice", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const styles = await readWeb("another_brain_chat/styles.css");

  for (const source of [html, app, styles]) {
    assert.doesNotMatch(source, /进入轻量模式|fast chat|lightweight_ready|lightweight_until_q4_ready|mobile_q4_warmup_deferred|q4_deferred|shouldDeferQ4WarmupOnThisDevice/);
  }
  assert.doesNotMatch(app, /params\.get\(["']lightweight["']\)/);
  assert.doesNotMatch(html, /loading-cancel-button|进入轻量模式/);
  assert.match(app, /q4_mount_required_before_chat/);
  assert.match(app, /setModelFullyLoaded\(false\)/);
  assert.match(app, /function shouldMountQ4InBackground\(\)/);
  assert.match(app, /q4_background/);
});

test("Chat surface hides engineering model details while dashboard keeps diagnostics", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const styles = await readWeb("another_brain_chat/styles.css");

  assert.match(html, /<p class="eyebrow">鳄鱼<\/p>/);
  assert.doesNotMatch(html, /<p class="eyebrow">another_brain<\/p>/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] \.dashboard-only\s*\{/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] \.message-footer\s*\{/);
  assert.match(html, /id="browser-compat-status"/);
  assert.match(html, /id="browser-embed-status"/);
});
