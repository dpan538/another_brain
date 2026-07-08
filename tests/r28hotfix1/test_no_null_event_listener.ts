import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("event binding remains null-safe", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const rootApp = await readFile(new URL("../../web/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("function on(node, eventName, handler"));
  assert.ok(app.includes("DOMContentLoaded"));
  assert.equal(/form\.addEventListener|contextImportButton\.addEventListener|modelSelfCheckButton\.addEventListener/.test(app), false);
  assert.ok(rootApp.includes("bindRootHandler"));
  assert.equal(rootApp.includes("els.form.addEventListener"), false);
});
