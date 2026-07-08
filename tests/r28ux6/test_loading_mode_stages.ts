import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("loading mode exposes startup copy, stages, and progress", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const loading = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/loading_screen.css", import.meta.url), "utf8");

  assert.ok(html.includes('data-loading-mode="active"'));
  assert.ok(html.includes("正在启动本地小模型"));
  for (const label of ["读取模型清单", "校验模型分片", "加载 tokenizer", "q4 warmup", "fallback ready"]) {
    assert.ok(html.includes(label), label);
    assert.ok(loading.includes(label), label);
  }
  for (const copy of ["本地运行，不调用云端 LLM", "小模型加载可能需要几十秒", "如果模型不可用，会使用边界回答", "证据不足时不会硬编"]) {
    assert.ok(loading.includes(copy), copy);
  }
  assert.ok(html.includes("loading-progress-bar"));
  assert.ok(css.includes("loading-breathe"));
  assert.ok(css.includes("min-height: 100svh"));
});
