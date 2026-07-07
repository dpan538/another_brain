import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("fallback reason is rendered in Chinese status copy", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");
  const runtime = await readFile("web/another_brain_chat/browser_runtime.js", "utf8");

  assert.match(html, /id="fallback-status"/);
  assert.match(app, /reasonLabel/);
  assert.match(app, /已回退/);
  assert.match(app, /证据不足/);
  assert.match(app, /请求隐藏提示或开发者消息/);
  assert.match(runtime, /本地静态 fallback/);
});
