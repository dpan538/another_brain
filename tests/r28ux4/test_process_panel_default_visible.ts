import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process panel is visible by default on desktop", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const aside = html.split("<aside class=\"process-panel\"", 2)[1] || "";
  assert.ok(aside);
  assert.equal(aside.split(">", 1)[0].includes("hidden"), false);
  for (const marker of ["输入包", "本地上下文", "检索证据", "模型草稿", "路由判断", "最终回答"]) {
    assert.ok(html.includes(marker), marker);
  }
});
