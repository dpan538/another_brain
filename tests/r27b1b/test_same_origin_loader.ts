import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadStaticShardManifest } from "../../src/browser_runtime/model_loader.ts";

function bytes(text) {
  return new TextEncoder().encode(text);
}

test("loads same-origin manifest and declared shard with sha256", async () => {
  const shardBytes = bytes("tiny shard");
  const sha256 = createHash("sha256").update(shardBytes).digest("hex");
  const manifest = {
    backend_inference: false,
    external_runtime_dependency: false,
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    tensor_shards: [{ path: "./tensor-00000.bin", sha256, bytes: shardBytes.length }]
  };
  const fetcher = async (url) => ({
    ok: true,
    status: 200,
    json: async () => manifest,
    arrayBuffer: async () => shardBytes.buffer
  });
  const loaded = await loadStaticShardManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    fetcher
  });
  assert.equal(loaded.loadedShards.length, 1);
});
