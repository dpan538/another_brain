import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat status badges stay small and non-dominant", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");

  assert.ok(html.includes("chat-model-badge"));
  assert.ok(html.includes("chat-source-badge"));
  assert.ok(html.includes("mini-warning"));
  assert.ok(css.includes(".mini-badge"));
  assert.ok(css.includes("font-size: 0.72rem"));
  assert.ok(css.includes("min-height: 24px"));
  assert.ok(app.includes("chatModelBadge"));
  assert.ok(app.includes("chatSourceBadge"));
});
