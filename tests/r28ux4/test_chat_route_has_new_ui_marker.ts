import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat route contains process-transparent UI marker", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("R28UX4") || html.includes("R28HOTFIX0"));
  assert.ok(html.includes("过程摘要"));
  assert.ok(html.includes("process-panel"));
  assert.ok(html.includes("static_q4_experimental"));
});
