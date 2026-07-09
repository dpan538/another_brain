import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UI and runtime keep non-product/non-admission claims explicit", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const finalQa = await readFile(new URL("../../scripts/r28ship2_final_qa_matrix.py", import.meta.url), "utf8");
  assert.ok(html.includes("not product"));
  assert.equal(runtimeMode.product_model, false);
  assert.equal(runtimeMode.browser_admission, false);
  assert.equal(runtimeMode.release_checkpoint, false);
  assert.equal(manifest.product_model_admission, false);
  assert.equal(manifest.browser_admission, false);
  assert.equal(manifest.release_checkpoint_admission, false);
  assert.ok(finalQa.includes('"product_admission": False'));
});
