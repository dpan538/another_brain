import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function readWeb(path) {
  return readFile(new URL(`../../web/${path}`, import.meta.url), "utf8");
}

test("frontend exposes no fast chat escape hatch and gates chat on full q4 mount", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const app = await readWeb("another_brain_chat/app.js");
  const css = await readWeb("another_brain_chat/styles.css");

  for (const source of [html, app, css]) {
    assert.doesNotMatch(source, /进入轻量模式|fast chat|lightweight_ready|lightweight_until_q4_ready|loading-cancel-button/);
  }
  assert.match(app, /let modelFullyLoaded = false/);
  assert.match(app, /function setModelFullyLoaded\(value\)/);
  assert.match(app, /if \(!modelFullyLoaded\) \{/);
  assert.match(app, /q4_mount_required_before_chat/);
  assert.match(app, /setDisabled\(sendButton, !modelFullyLoaded\)/);
  assert.match(app, /setHidden\(modelLoadingPanel, !modelLoadingRequested\)/);
});

test("chat visual contract is fixed-height, no-gradient, and 3:1 conversation to input", async () => {
  const html = await readWeb("another_brain_chat/index.html");
  const css = await readWeb("another_brain_chat/styles.css");

  assert.doesNotMatch(css, /linear-gradient|radial-gradient|repeating-linear/i);
  assert.match(css, /body\s*\{[\s\S]*overflow: hidden;/);
  assert.match(css, /\.app-shell\[data-ui-mode="chat"\] \.conversation-pane\s*\{[\s\S]*grid-template-rows: minmax\(0, 3fr\) minmax\(116px, 1fr\);/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*grid-template-rows: minmax\(0, 3fr\) minmax\(116px, 1fr\);/);
  assert.match(css, /\.app-shell\[data-ui-mode="chat"\] textarea\s*\{[\s\S]*resize: none;/);
  assert.match(html, /id="runtime-chart-line"/);
  assert.match(css, /\.runtime-chart\s*\{/);
});
