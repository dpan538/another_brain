import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process panel is present as default desktop layout", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  assert.ok(html.includes('class="process-panel"'));
  assert.ok(html.includes("过程摘要"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) minmax(360px, 430px)"));
});
