import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("R28STAB0 keeps non-claims and local-only runtime boundaries", async () => {
  const runtimeMode = JSON.parse(await readFile(new URL("../../web/another_brain/runtime_mode.json", import.meta.url), "utf8"));
  const assetManifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const app = await readFile(new URL("../../web/another_brain_chat/app.js", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  assert.equal(runtimeMode.product_model, false);
  assert.equal(runtimeMode.backend_inference, false);
  assert.equal(runtimeMode.external_llm_api, false);
  assert.equal(assetManifest.backend_inference, false);
  assert.equal(assetManifest.external_llm_api, false);
  assert.equal(assetManifest.doubao, false);
  assert.equal(assetManifest.hosted_vector_store, false);
  assert.ok(app.includes("config.product_model"));
  assert.ok(app.includes("not product, browser, or release admission"));
  assert.ok(runtime.includes("not product model"));
  assert.ok(runtime.includes("no training"));
  assert.equal(/product_model:\s*true|browser_admission:\s*true|release_checkpoint:\s*true/.test(`${app}\n${runtime}`), false);
});
