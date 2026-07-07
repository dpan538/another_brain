import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mobile layout prevents narrow-screen overflow and honors reduced motion", async () => {
  const css = await readFile("web/another_brain_chat/styles.css", "utf8");

  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms/);
});
