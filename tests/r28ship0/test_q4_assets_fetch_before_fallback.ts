import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("runtime checks q4 assets and tokenizer before fallback", async () => {
  const runtime = await readFile(new URL("../../web/another_brain_chat/browser_runtime.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../../web/another_brain/asset_manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.model_assets.filter((item) => item.role === "q4_shard").length, 5);
  assert.ok(runtime.includes("fetchJsonSameOrigin(\"another_brain/asset_manifest.json\""));
  assert.ok(runtime.includes("fetchJsonSameOrigin(quantizationPath"));
  assert.ok(runtime.includes("fetchJsonSameOrigin(tokenizerPath"));
  assert.ok(runtime.includes("probeSameOriginAsset(item.path"));
  assert.ok(runtime.includes("runtime_tokenizer_fetch_failed"));
  assert.ok(runtime.includes("quick_check_failed_before_q4_forward"));
});
