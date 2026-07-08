import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model loading panel exposes manifest, shard, tokenizer, q4 warmup, guarded boundary status, progress, and stop", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  for (const text of ["模型资产检查中", "读取模型清单", "校验 shards", "加载 tokenizer", "q4 warmup", "边界回答待命", "停止检查"]) {
    assert.ok(html.includes(text) || app.includes(text), text);
  }
  for (const id of ["model-loading-panel", "model-loading-progress-bar", "loading-cancel-button"]) {
    assert.ok(html.includes(id), id);
  }
  assert.ok(css.includes("@keyframes loading-sheen"));
  assert.ok(app.includes("MODEL_LOADING_STAGES"));
  assert.ok(app.includes("renderModelLoading"));
});
