import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process panel and model self-check are visible in all entries", async () => {
  const entries = [
    "../../web/index.html",
    "../../web/another_brain_chat.html",
    "../../web/another_brain_chat/index.html",
  ];
  for (const entry of entries) {
    const html = await readFile(new URL(entry, import.meta.url), "utf8");
    for (const marker of ["过程摘要", "static_q4_experimental", "exact_runtime_tokenizer", "检查本地模型路径"]) {
      assert.ok(html.includes(marker), `${entry} missing ${marker}`);
    }
    assert.ok(html.includes("R28HOTFIX2") || html.includes("R28HOTFIX3"), `${entry} missing hotfix build marker`);
  }
});
