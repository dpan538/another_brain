import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process panel exposes the six public stages", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  for (const marker of ["①", "②", "③", "④", "⑤", "⑥", "输入包", "本地上下文", "检索证据", "模型草稿", "路由判断", "最终回答"]) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  assert.ok(html.includes("process-panel"));
  assert.ok(html.includes("过程摘要"));
});
