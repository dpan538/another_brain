import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("static chat shell uses Chinese-first boundary copy", async () => {
  const html = await readFile("web/another_brain_chat/index.html", "utf8");
  const app = await readFile("web/another_brain_chat/app.js", "utf8");

  for (const marker of [
    "本地静态运行",
    "prelaunch engineering candidate",
    "没有接入真实模型资产",
    "只进入当前 session",
    "不进入训练",
    "辅助证据，不是 answer bank",
    "不是 product model",
    "fallback / synthetic"
  ]) {
    assert.match(`${html}\n${app}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
