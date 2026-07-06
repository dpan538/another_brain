import test from "node:test";
import assert from "node:assert/strict";
import { assertSameOriginPath, loadStaticShardManifest } from "../../src/browser_runtime/model_loader.ts";

test("rejects external model URLs", () => {
  assert.throws(() => assertSameOriginPath("https://evil.test/model.bin", "https://example.test/app/"), /non_same_origin/);
});

test("rejects missing budget metadata", async () => {
  const fetcher = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ backend_inference: false, external_runtime_dependency: false, tensor_shards: [{ path: "./a.bin" }] })
  });
  await assert.rejects(
    () => loadStaticShardManifest({ manifestUrl: "/m.json", baseUrl: "https://example.test/app/", fetcher }),
    /missing_budget_metadata/
  );
});
