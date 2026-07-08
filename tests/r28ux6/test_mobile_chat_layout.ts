import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile chat layout avoids horizontal overflow and keeps input reachable", async () => {
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const loadingCss = await readFile(new URL("../../web/another_brain_chat/loading_screen.css", import.meta.url), "utf8");

  assert.ok(css.includes("overflow-x: hidden"));
  assert.ok(css.includes("@media (max-width: 720px)"));
  assert.ok(css.includes(".app-shell"));
  assert.ok(css.includes("width: 100%"));
  assert.ok(css.includes("position: sticky"));
  assert.ok(css.includes("bottom: 0"));
  assert.ok(css.includes("100svh"));
  assert.ok(loadingCss.includes("@media (max-width: 720px)"));
  assert.ok(loadingCss.includes("grid-template-columns: 1fr"));
  assert.ok(loadingCss.includes("width: 100%"));
});
