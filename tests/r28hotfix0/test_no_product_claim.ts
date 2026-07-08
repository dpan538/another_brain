import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28 hotfix keeps non-product claims visible", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  assert.ok(html.includes("不是已 admission 的产品模型"));
  assert.equal(runtimeMode.product_model, false);
  assert.equal(runtimeMode.product_admission, false);
  assert.equal(runtimeMode.browser_admission, false);
  assert.equal(runtimeMode.release_checkpoint, false);
});
