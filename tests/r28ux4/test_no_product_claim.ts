import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28UX4 keeps non-product claims visible", async () => {
  const root = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
  const chat = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  assert.ok(`${root}\n${chat}`.includes("not product"));
  assert.equal(runtimeMode.product_admission, false);
  assert.equal(runtimeMode.browser_admission, false);
  assert.equal(runtimeMode.release_checkpoint_admission, false);
});
