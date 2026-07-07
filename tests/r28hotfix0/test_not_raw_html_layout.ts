import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat route uses styled product layout assets instead of raw HTML defaults", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  assert.ok(html.includes('href="/another_brain_chat/styles.css?v=r28hotfix0-runtime-ui-activation"'));
  assert.ok(html.includes('src="/another_brain_chat/app.js?v=r28hotfix0-runtime-ui-activation"'));
  assert.ok(css.includes(".workspace-grid"));
  assert.ok(css.includes(".message"));
  assert.ok(css.includes(".badge"));
});
