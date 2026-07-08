import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("latest P0 version is wired through chat entrypoints and workers", async () => {
  const version = "r28p0e-real-browser-q4-forward";
  const html = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const runtime = await readWeb("another_brain_chat/browser_runtime.js");
  const worker = await readWeb("another_brain_chat/runtime_worker.js");
  const selfCheck = await readWeb("another_brain_chat/self_check_worker.js");
  const q4 = await readWeb("another_brain_chat/q4_worker_runtime.js");

  for (const source of [html, app, runtime, worker, selfCheck, q4]) {
    assert.match(source, new RegExp(version), "P0D cache-bust version should be present");
  }
});

test("mobile chat keeps the two-card layout and one visible action", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const styles = await readWeb("another_brain_chat/styles.css");

  assert.match(html, /<section class="message-list" id="message-list"/);
  assert.match(html, /<form class="composer" id="chat-form"/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] \.message-list\s*\{/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] \.composer\s*\{/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] \.composer-actions \.button-secondary\s*\{[\s\S]*display: none;/);
  assert.match(styles, /\.app-shell\[data-ui-mode="chat"\] #send-button\s*\{[\s\S]*min-height: 52px;/);
  assert.match(styles, /overflow-x: hidden/);
  assert.match(styles, /background-color: #101010/);
});
