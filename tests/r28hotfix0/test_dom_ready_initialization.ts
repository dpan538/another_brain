import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat app initializes after DOM is ready or already loaded", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes('document.readyState === "loading"'));
  assert.ok(app.includes('document.addEventListener("DOMContentLoaded", start, { once: true })'));
  assert.ok(app.includes("start();"));
});
