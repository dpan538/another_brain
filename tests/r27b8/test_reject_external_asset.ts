import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../../src/browser_runtime/assets/checksum.ts";
import { assertSameOriginAssetUrl, loadShardedAssetManifest } from "../../src/browser_runtime/assets/shard_loader.ts";

test("same-origin validator rejects external model asset URLs", () => {
  assert.throws(
    () => assertSameOriginAssetUrl("https://evil.test/model.bin", "https://example.test/app/"),
    /non_same_origin/
  );
  assert.throws(
    () => assertSameOriginAssetUrl("//evil.test/model.bin", "https://example.test/app/"),
    /external_asset_url/
  );
});

test("loader rejects external shard declared by same-origin manifest", async () => {
  const shardBytes = new TextEncoder().encode("tiny");
  const manifest = {
    runtime_version: "r27b8-test-v1",
    backend_inference: false,
    external_runtime_dependency: false,
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "https://evil.test/tensor.bin", sha256: await sha256Hex(shardBytes), bytes: shardBytes.length }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/app/",
    fetcher: async () => ({ ok: true, status: 200, json: async () => manifest }),
    allowPartialFailure: true
  });
  assert.equal(state.ok, false);
  assert.match(state.failures[0].reason, /non_same_origin/);
});
