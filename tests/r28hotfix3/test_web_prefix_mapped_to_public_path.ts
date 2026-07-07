import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrowserAssetPath } from "../../src/browser_runtime/assets/asset_path_normalizer.ts";

test("web prefix is mapped away before browser fetch", () => {
  assert.equal(
    normalizeBrowserAssetPath("web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"),
    "/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json"
  );
});
