import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("message UI exposes pending state, answer status, retry, clear, and copy controls", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  const css = await readFile("web/another_brain_chat/styles.css", "utf8");

  for (const id of ["answer-status", "retry-last-button", "clear-conversation-button", "send-button"]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`#${id}`));
  }
  assert.match(app, /正在生成本地回答/);
  assert.match(app, /message-pending/);
  assert.match(app, /复制回答/);
  assert.match(app, /copyAnswer/);
  assert.match(app, /form\.requestSubmit/);
  assert.match(css, /\.message-pending/);
});
