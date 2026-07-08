import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generation uses a subtle breathing indicator without exposing reasoning", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes('data-generating="false"'));
  assert.ok(css.includes('data-generating="true"'));
  assert.ok(css.includes("ux6-breathing"));
  assert.ok(app.includes("function setGenerating"));
  assert.ok(app.includes("setGenerating(true)"));
  assert.ok(app.includes("setGenerating(false)"));
});
