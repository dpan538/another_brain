import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

test("asset manifest declares demo RAG asset within 100MB budget", async () => {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(resolve(root, "web/another_brain/asset_manifest.json"), "utf8"));
  assert.equal(manifest.same_origin_only, true);
  assert.equal(manifest.backend_inference, false);
  assert.equal(manifest.rag_assets.length, 1);
  const asset = manifest.rag_assets[0];
  const actual = (await stat(resolve(root, "web", asset.path))).size;
  assert.equal(asset.bytes, actual);
  const gateTotal = await manifest.gate_assets.reduce(async (sumPromise, gateAsset) => {
    const sum = await sumPromise;
    return sum + (await stat(resolve(root, "web", gateAsset.path))).size;
  }, Promise.resolve(0));
  assert.equal(manifest.total_declared_bytes, actual + gateTotal);
  assert.ok(manifest.total_declared_bytes < manifest.max_total_static_bytes);
});
