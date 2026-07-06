import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../../src/browser_runtime/assets/checksum.ts";
import { loadShardedAssetManifest } from "../../src/browser_runtime/assets/shard_loader.ts";

function bytes(text) {
  return new TextEncoder().encode(text);
}

function arrayBuffer(bytesValue) {
  return bytesValue.buffer.slice(bytesValue.byteOffset, bytesValue.byteOffset + bytesValue.byteLength);
}

test("same-origin shard loader fetches, verifies, caches, and reports progress", async () => {
  const shardBytes = bytes("same origin tiny shard");
  const manifest = {
    runtime_version: "r27b8-test-v1",
    backend_inference: false,
    external_runtime_dependency: false,
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "./tensor-00000.bin", sha256: await sha256Hex(shardBytes), bytes: shardBytes.length }]
  };
  const events = [];
  const fetched = [];
  let shardAttempts = 0;
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    onProgress: (event) => events.push(event),
    fetcher: async (url) => {
      fetched.push(url);
      if (url.endsWith("model_manifest.json")) {
        return { ok: true, status: 200, json: async () => manifest };
      }
      shardAttempts += 1;
      if (shardAttempts === 1) {
        return { ok: false, status: 503, arrayBuffer: async () => arrayBuffer(bytes("unavailable")) };
      }
      return { ok: true, status: 200, arrayBuffer: async () => arrayBuffer(shardBytes) };
    }
  });

  assert.equal(state.ok, true);
  assert.equal(state.loadedShards.length, 1);
  assert.equal(state.loadedShards[0].cache_hit, false);
  assert.equal(state.progress.loaded_shards, 1);
  assert.equal(state.cache.mode, "memory_fallback");
  assert.ok(fetched.some((url) => url.endsWith("tensor-00000.bin")));
  assert.equal(shardAttempts, 2);
  assert.ok(events.some((event) => event.status === "cache_miss"));
  assert.ok(events.some((event) => event.status === "retry"));
  assert.ok(events.some((event) => event.status === "verified"));
});

test("same-origin shard loader honors abort signals before shard fetch", async () => {
  const controller = new AbortController();
  controller.abort();
  const manifest = {
    runtime_version: "r27b8-test-v1",
    backend_inference: false,
    external_runtime_dependency: false,
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "./tensor-00000.bin", sha256: await sha256Hex("tiny"), bytes: 4 }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    signal: controller.signal,
    allowPartialFailure: true,
    fetcher: async () => ({ ok: true, status: 200, json: async () => manifest })
  });

  assert.equal(state.ok, false);
  assert.match(state.fallback_reason, /asset_load_aborted/);
});
