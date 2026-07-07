import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28UX4 version badge and build status are visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(html.includes("ui-version-badge"));
  assert.ok(html.includes("R28UX4"));
  assert.ok(html.includes("r28ux4-visible-preview-ui"));
  assert.ok(app.includes("R28UX4_UI_VERSION"));
});
