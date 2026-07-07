import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeBrowserAssetPath } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("all committed q4 shard manifest paths normalize to public absolute paths", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const shards = manifest.model_assets.filter((item) => item.role === "q4_shard");
  assert.equal(shards.length, 5);
  for (const shard of shards) {
    assert.match(normalizeBrowserAssetPath(shard.path), /^\/another_brain\/model_assets\/r28m1\/shards\/model-q4-\d{5}\.bin$/);
  }
});
