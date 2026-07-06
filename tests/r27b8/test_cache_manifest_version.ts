import test from "node:test";
import assert from "node:assert/strict";
import { BrowserAssetCache } from "../../src/browser_runtime/assets/asset_cache.ts";

test("asset cache invalidates entries from older manifest versions", async () => {
  const cache = new BrowserAssetCache({ manifestVersion: "v1", env: {} });
  const url = "https://example.test/another_brain/tensor.bin";
  await cache.put(url, new TextEncoder().encode("old"), { manifestVersion: "v1" });
  assert.equal((await cache.get(url, { manifestVersion: "v1" })).hit, true);

  await cache.invalidateByManifestVersion("v2");
  assert.equal((await cache.get(url, { manifestVersion: "v1" })).hit, false);

  await cache.put(url, new TextEncoder().encode("new"), { manifestVersion: "v2" });
  const cached = await cache.get(url, { manifestVersion: "v2" });
  assert.equal(cached.hit, true);
  assert.equal(new TextDecoder().decode(cached.bytes), "new");
});
