import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root route contains process UI marker", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("R28UX4") || html.includes("R28HOTFIX0") || html.includes("R28HOTFIX1") || html.includes("R28HOTFIX2") || html.includes("R28HOTFIX3"));
  assert.ok(html.includes("过程摘要"));
  assert.ok(html.includes("another_brain_chat"));
});
