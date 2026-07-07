import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("root route contains R28UX4 process UI marker", async () => {
  const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  assert.ok(html.includes("R28UX4"));
  assert.ok(html.includes("过程摘要"));
  assert.ok(html.includes("another_brain_chat"));
});
