import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Dashboard Mode is one click away and preserves process transparency panels", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes(">Dashboard<"));
  assert.ok(html.includes("process-panel dashboard-only") || html.includes("dashboard-only\" id=\"process-panel"));
  for (const marker of ["过程摘要", "检查本地模型路径", "检索证据", "模型草稿", "Release Blockers"]) {
    assert.ok(html.includes(marker), marker);
  }
  assert.ok(app.includes('setUiMode("dashboard")'));
  assert.ok(app.includes('setUiMode("chat")'));
  assert.ok(app.includes("aria-pressed"));
});
