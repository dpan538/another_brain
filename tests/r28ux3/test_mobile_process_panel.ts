import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("process panel has responsive mobile layout", async () => {
  const css = await readFile(new URL("../../web/another_brain_chat/styles.css", import.meta.url), "utf8");
  assert.ok(css.includes(".process-panel"));
  assert.ok(css.includes("@media (max-width: 1080px)"));
  assert.ok(css.includes("@media (max-width: 720px)"));
  assert.ok(css.includes("grid-template-columns: 1fr"));
});
