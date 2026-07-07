import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("adapter import UI has JSON/plain text tabs, validation, privacy, and evidence count", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");

  for (const id of [
    "context-tab-text",
    "context-tab-json",
    "context-import",
    "context-import-button",
    "context-clear-button",
    "context-bridge-status",
    "context-validation",
    "context-privacy-note"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`#${id}`));
  }
  assert.match(html, /role="tablist"/);
  assert.match(app, /setContextMode/);
  assert.match(app, /导入成功/);
  assert.match(app, /导入失败/);
  assert.match(app, /不会进入训练/);
  assert.match(app, /summary\.evidence_record_count/);
});
