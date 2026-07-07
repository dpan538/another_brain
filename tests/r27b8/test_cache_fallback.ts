import test from "node:test";
import assert from "node:assert/strict";
import { BrowserAssetCache } from "../../src/browser_runtime/assets/asset_cache.ts";
import { probeAssetCacheCapabilities } from "../../src/browser_runtime/assets/cache_capability.ts";

test("asset cache uses memory fallback when CacheStorage is unavailable", async () => {
  const env = { indexedDB: {}, navigator: { onLine: false } };
  const capabilities = probeAssetCacheCapabilities(env);
  assert.equal(capabilities.cache_storage_available, false);
  assert.equal(capabilities.indexed_db_available, true);
  assert.equal(capabilities.offline_static_cache_supported, true);

  const cache = new BrowserAssetCache({ manifestVersion: "v1", env });
  assert.equal(cache.mode(), "memory_fallback");
  await cache.put("https://example.test/asset.bin", new Uint8Array([1, 2, 3]));
  const cached = await cache.get("https://example.test/asset.bin");
  assert.equal(cached.hit, true);
  assert.deepEqual(Array.from(cached.bytes), [1, 2, 3]);
});
