import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("declared static bundle remains under the 100MB prelaunch budget", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.max_total_static_bytes, 100000000);
  assert.ok(Number(manifest.full_bundle_estimate_bytes) < Number(manifest.max_total_static_bytes));
  assert.ok(Number(manifest.remaining_bytes_under_100mb) > 0);
});
