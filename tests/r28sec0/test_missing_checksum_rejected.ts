import test from "node:test";
import assert from "node:assert/strict";
import { loadShardedAssetManifest } from "../../src/browser_runtime/assets/shard_loader.ts";

test("missing checksum for model asset is rejected before shard fetch", async () => {
  let shardFetchCalled = false;
  const manifest = {
    runtime_version: "r28sec0-missing-checksum",
    backend_inference: false,
    external_runtime_dependency: false,
    quantization: "q4",
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "./tensor-00000.bin", bytes: 4 }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    allowPartialFailure: true,
    fetcher: async (url) => {
      if (url.endsWith("model_manifest.json")) {
        return { ok: true, status: 200, json: async () => manifest };
      }
      shardFetchCalled = true;
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4) };
    }
  });

  assert.equal(state.ok, false);
  assert.equal(shardFetchCalled, false);
  assert.match(state.fallback_reason, /missing_sha256/);
  assert.equal(state.fallback_mode, "synthetic_demo");
});
