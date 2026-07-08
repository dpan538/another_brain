import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model loading can be cancelled into lightweight chat mode", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const loading = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");

  assert.ok(html.includes("loading-cancel-button"));
  assert.ok(html.includes("取消加载 / 进入轻量模式"));
  assert.ok(loading.includes("options.onCancel"));
  assert.ok(app.includes("model_loading_cancelled"));
  assert.ok(app.includes("setLoadingMode(false)"));
  assert.ok(app.includes('setUIMode("chat")'));
  assert.ok(app.includes("loadingScreenDismissed = true"));
});
