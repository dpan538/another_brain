import test from "node:test";
import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeBrowserAssetPath } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("self-check shard paths point to non-empty committed files", async () => {
  const root = new URL("../..", import.meta.url).pathname;
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  const shards = manifest.model_assets.filter((item) => item.role === "q4_shard");
  let checked = 0;
  for (const shard of shards) {
    const normalized = normalizeBrowserAssetPath(shard.path);
    const file = join(root, "web", normalized.slice(1));
    const info = await stat(file);
    assert.ok(info.size > 0);
    checked += 1;
  }
  assert.equal(checked, 5);
});
