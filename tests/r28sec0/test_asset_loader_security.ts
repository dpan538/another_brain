import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../../src/browser_runtime/assets/checksum.ts";
import {
  assertSameOriginAssetUrl,
  loadShardedAssetManifest
} from "../../src/browser_runtime/assets/shard_loader.ts";

function bytes(text) {
  return new TextEncoder().encode(text);
}

function arrayBuffer(bytesValue) {
  return bytesValue.buffer.slice(bytesValue.byteOffset, bytesValue.byteOffset + bytesValue.byteLength);
}

test("asset loader rejects external URL and artifact/private paths", () => {
  assert.throws(
    () => assertSameOriginAssetUrl("https://outside.invalid/model.bin", "https://example.test/app/"),
    /non_same_origin_asset_rejected/
  );
  assert.throws(
    () => assertSameOriginAssetUrl("/artifacts/model.bin", "https://example.test/app/"),
    /private_or_artifact_path_rejected/
  );
  assert.throws(
    () => assertSameOriginAssetUrl("/private/model.bin", "https://example.test/app/"),
    /private_or_artifact_path_rejected/
  );
});

test("unknown quantization manifest fails closed to synthetic demo fallback", async () => {
  const shardBytes = bytes("tiny shard");
  const manifest = {
    runtime_version: "r28sec0-unknown-quant",
    backend_inference: false,
    external_runtime_dependency: false,
    quantization: "q13_unsafe",
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "./tensor-00000.bin", sha256: await sha256Hex(shardBytes), bytes: shardBytes.length }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    allowPartialFailure: true,
    fetcher: async () => ({ ok: true, status: 200, json: async () => manifest })
  });
  assert.equal(state.ok, false);
  assert.equal(state.fallback_mode, "synthetic_demo");
  assert.match(state.fallback_reason, /unknown_quantization_manifest/);
});

test("oversized undeclared fetched asset is rejected", async () => {
  const fetchedBytes = bytes("larger than declared");
  const manifest = {
    runtime_version: "r28sec0-oversized",
    backend_inference: false,
    external_runtime_dependency: false,
    quantization: "q4",
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    total_bytes: 4,
    shards: [{ path: "./tensor-00000.bin", sha256: await sha256Hex(fetchedBytes), bytes: 4 }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    allowPartialFailure: true,
    fetcher: async (url) => {
      if (url.endsWith("model_manifest.json")) {
        return { ok: true, status: 200, json: async () => manifest };
      }
      return { ok: true, status: 200, arrayBuffer: async () => arrayBuffer(fetchedBytes) };
    }
  });
  assert.equal(state.ok, false);
  assert.match(state.failures[0].reason, /undeclared_asset_size_exceeded/);
});
