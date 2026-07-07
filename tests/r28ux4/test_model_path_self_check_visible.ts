import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model path self-check is visible with required status fields", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(html.includes("检查本地模型路径"));
  for (const id of ["self-check-assets", "self-check-tokenizer", "self-check-q4", "self-check-fallback"]) {
    assert.ok(html.includes(id), id);
  }
  assert.ok(app.includes("q4_forward_ran"));
  assert.ok(app.includes("answer_source"));
});
