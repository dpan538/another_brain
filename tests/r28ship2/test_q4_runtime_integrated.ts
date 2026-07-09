import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("q4 runtime uses admitted same-origin assets, exact tokenizer, and retry-before-fallback", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const normalizer = await readFile(new URL("../../src/browser_runtime/assets/asset_path_normalizer.ts", import.meta.url), "utf8");
  const vercelIgnore = await readFile(new URL("../../.vercelignore", import.meta.url), "utf8").catch(async () =>
    readFile(new URL("../../web/../.vercelignore", import.meta.url), "utf8")
  );

  assert.equal(manifest.model_assets_admitted, true);
  assert.equal(manifest.model_asset_manifest.exact_runtime_tokenizer, true);
  assert.ok(manifest.model_assets.some((item) => item.path.endsWith("model-q4-00001.bin")));
  assert.ok(manifest.tokenizer_assets.some((item) => item.role === "exact_runtime_tokenizer"));
  assert.ok(runtime.includes("mountQ4WithRetry"));
  assert.ok(runtime.includes("static_q4_experimental"));
  assert.ok(runtime.includes("q4_retry_plan_exhausted"));
  assert.ok(normalizer.includes("new URL"));
  assert.ok(normalizer.includes("external_asset_url_rejected"));
  assert.ok(vercelIgnore.includes("*.bin"));
  assert.ok(vercelIgnore.includes("!web/another_brain/model_assets/r28m1/**"));
});
