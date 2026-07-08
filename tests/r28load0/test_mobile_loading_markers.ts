import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile loading UI exposes required markers and local-only copy", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/loading_screen.css", import.meta.url), "utf8");
  const js = await readFile(new URL("../../web/another_brain_chat/loading_screen.js", import.meta.url), "utf8");

  for (const marker of [
    "model-loading-panel",
    "loading-progress-bar",
    "loading-cancel-button",
    "data-loading-step=\"checking_manifest\"",
    "data-loading-step=\"checking_shards\"",
    "data-loading-step=\"checking_tokenizer\"",
    "data-loading-step=\"warming_q4\"",
    "data-loading-step=\"fallback_ready\""
  ]) {
    assert.ok(html.includes(marker), marker);
  }
  for (const copy of [
    "正在加载本地小模型",
    "不会调用云端 LLM",
    "如果模型不可用，会使用边界回答",
    "证据不足时不会硬编"
  ]) {
    assert.ok(js.includes(copy), copy);
  }
  assert.ok(css.includes("@media (max-width: 720px)"));
  assert.ok(css.includes("width: min(100% - 24px, 460px)"));
  assert.ok(css.includes("loading-breathe"));
});
