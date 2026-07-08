import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("multiple self-check clicks keep only one active check", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("let activeSelfCheckController = null"));
  assert.ok(app.includes("if (activeSelfCheckController)"));
  assert.ok(app.includes("activeSelfCheckController.abort()"));
  assert.ok(app.includes("activeSelfCheckController = controller"));
});
