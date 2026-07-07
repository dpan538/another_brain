import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrowserAssetPath, toSameOriginAssetUrl } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("normalizes public q4 asset paths to same-origin absolute browser paths", () => {
  assert.equal(
    normalizeBrowserAssetPath("another_brain/model_assets/r28m1/shards/a.bin"),
    "/another_brain/model_assets/r28m1/shards/a.bin"
  );
  assert.equal(
    normalizeBrowserAssetPath("/another_brain/model_assets/r28m1/shards/a.bin"),
    "/another_brain/model_assets/r28m1/shards/a.bin"
  );
  assert.equal(
    normalizeBrowserAssetPath("web/another_brain/model_assets/r28m1/shards/a.bin"),
    "/another_brain/model_assets/r28m1/shards/a.bin"
  );
  assert.equal(
    normalizeBrowserAssetPath("./shards/a.bin", { basePath: "/another_brain/model_assets/r28m1/" }),
    "/another_brain/model_assets/r28m1/shards/a.bin"
  );
  assert.equal(
    toSameOriginAssetUrl("another_brain/model_assets/r28m1/shards/a.bin", { origin: "https://preview.example" }).href,
    "https://preview.example/another_brain/model_assets/r28m1/shards/a.bin"
  );
});

test("rejects traversal, external, artifact, and ingestion paths", () => {
  for (const value of [
    "../another_brain/model_assets/r28m1/shards/a.bin",
    "https://example.com/model-q4-00001.bin",
    "//example.com/model-q4-00001.bin",
    "artifacts/r28/model.bin",
    "data/public_ingestion/raw.jsonl",
    "another_brain/model_assets/r28m1/../secret.bin"
  ]) {
    assert.throws(() => normalizeBrowserAssetPath(value));
  }
});
