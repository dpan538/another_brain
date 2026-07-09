import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrowserAssetPath } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("path traversal is rejected before fetch", () => {
  assert.throws(() => normalizeBrowserAssetPath("./../shards/a.bin", { basePath: "/another_brain/model_assets/r28m1/" }), /path_traversal_rejected|asset_path_not_public/);
});
