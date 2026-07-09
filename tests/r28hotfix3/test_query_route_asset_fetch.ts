import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrowserAssetPath, toSameOriginAssetUrl } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("query chat route still resolves q4 assets at origin root", () => {
  const route = "https://preview.example/another_brain_chat?message=%E4%BD%A0%E6%98%AF%E8%B0%81";
  const url = toSameOriginAssetUrl("another_brain/model_assets/r28m1/shards/model-q4-00001.bin", {
    origin: new URL(route).origin
  });
  assert.equal(url.href, "https://preview.example/another_brain/model_assets/r28m1/shards/model-q4-00001.bin");
  assert.equal(normalizeBrowserAssetPath("another_brain/model_assets/r28m1/shards/model-q4-00001.bin"), "/another_brain/model_assets/r28m1/shards/model-q4-00001.bin");
});
