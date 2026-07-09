import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UX5 keeps non-claims and does not claim product admission", async () => {
  const html = await readFile(new URL("../../web/another_brain_chat/index.html", import.meta.url), "utf8");
  const runtime = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));

  assert.ok(html.includes("not product"));
  assert.equal(runtime.product_model, false);
  assert.equal(runtime.product_admission, false);
  assert.equal(runtime.browser_admission, false);
  assert.equal(runtime.release_checkpoint_admission, false);
  assert.equal(manifest.non_claims.product_model, false);
  assert.equal(manifest.non_claims.product_admission, false);
  assert.equal(manifest.non_claims.browser_admission, false);
  assert.equal(manifest.non_claims.release_checkpoint_admission, false);
});
