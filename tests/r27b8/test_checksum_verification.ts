import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex, verifySha256 } from "../../src/browser_runtime/assets/checksum.ts";
import { loadShardedAssetManifest } from "../../src/browser_runtime/assets/shard_loader.ts";

function arrayBuffer(bytesValue) {
  return bytesValue.buffer.slice(bytesValue.byteOffset, bytesValue.byteOffset + bytesValue.byteLength);
}

test("sha256 verification reports matching and mismatching bytes", async () => {
  const bytes = new TextEncoder().encode("checksum ok");
  const expected = await sha256Hex(bytes);
  assert.equal((await verifySha256(bytes, expected)).ok, true);
  const mismatch = await verifySha256(new TextEncoder().encode("checksum bad"), expected);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, "sha256_mismatch");
});

test("loader reports checksum failure without admitting partial shard set", async () => {
  const shardBytes = new TextEncoder().encode("actual shard");
  const manifest = {
    runtime_version: "r27b8-test-v1",
    backend_inference: false,
    external_runtime_dependency: false,
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "./tensor.bin", sha256: await sha256Hex("different shard"), bytes: shardBytes.length }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/app/",
    fetcher: async (url) => {
      if (url.endsWith("model_manifest.json")) return { ok: true, status: 200, json: async () => manifest };
      return { ok: true, status: 200, arrayBuffer: async () => arrayBuffer(shardBytes) };
    },
    allowPartialFailure: true
  });
  assert.equal(state.ok, false);
  assert.match(state.failures[0].reason, /sha256_mismatch/);
  assert.equal(state.loadedShards.length, 0);
});
