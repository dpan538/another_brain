import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile loading UI exposes LOAD0-compatible stages, animation, and cancel path", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/loading_screen.css", import.meta.url), "utf8");
  const js = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");

  for (const marker of [
    "model-loading-panel",
    "loading-progress-bar",
    "loading-cancel-button",
    'data-loading-step="checking_manifest"',
    'data-loading-step="checking_shards"',
    'data-loading-step="checking_tokenizer"',
    'data-loading-step="warming_q4"',
    'data-loading-step="fallback_ready"'
  ]) assert.ok(html.includes(marker), marker);
  assert.ok(css.includes("@media (max-width: 720px)"));
  assert.ok(css.includes("loading-breathe"));
  assert.ok(js.includes("不会调用云端 LLM"));
  assert.ok(js.includes("如果模型不可用，会使用边界回答"));
});
