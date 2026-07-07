import test from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "../../src/browser_runtime/assets/checksum.ts";
import {
  assertSameOriginAssetUrl,
  loadShardedAssetManifest
} from "../../src/browser_runtime/assets/shard_loader.ts";

test("same-origin asset validator rejects path traversal", () => {
  assert.throws(
    () => assertSameOriginAssetUrl("../private/model.bin", "https://example.test/another_brain_chat/"),
    /path_traversal_asset_rejected/
  );
  assert.throws(
    () => assertSameOriginAssetUrl("%2e%2e/private/model.bin", "https://example.test/another_brain_chat/"),
    /path_traversal_asset_rejected/
  );
});

test("manifest shard path traversal fails closed", async () => {
  const bytes = new TextEncoder().encode("tiny");
  const manifest = {
    runtime_version: "r28sec0-path-traversal",
    backend_inference: false,
    external_runtime_dependency: false,
    quantization: "q4",
    budget: { max_total_static_bytes: 100000000, model_weight_budget_bytes: 70000000 },
    shards: [{ path: "../private/tensor.bin", sha256: await sha256Hex(bytes), bytes: bytes.length }]
  };
  const state = await loadShardedAssetManifest({
    manifestUrl: "/another_brain/model_manifest.json",
    baseUrl: "https://example.test/another_brain_chat/",
    allowPartialFailure: true,
    fetcher: async () => ({ ok: true, status: 200, json: async () => manifest })
  });
  assert.equal(state.ok, false);
  assert.match(state.failures[0].reason, /path_traversal_asset_rejected/);
});
