import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("chat send path is independent from model loading self-check", async () => {
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const submitStart = app.indexOf('on(form, "submit"');
  const submitEnd = app.indexOf('on(debugToggle, "change"', submitStart);
  const submitHandler = app.slice(submitStart, submitEnd);

  assert.ok(submitHandler.includes("runtime.run(text"));
  assert.equal(submitHandler.includes("quickSelfCheckModelPath"), false);
  assert.equal(submitHandler.includes("deepSelfCheckModelPath"), false);
  assert.equal(submitHandler.includes("activeSelfCheckController"), false);
  assert.equal(submitHandler.includes("setDisabled(input"), false);
});
