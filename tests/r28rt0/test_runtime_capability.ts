import test from "node:test";
import assert from "node:assert/strict";
import {
  R28RT0_FORWARD_BLOCKER,
  R28RT0_REAL_INFERENCE_BLOCKER,
  StaticQ4ExperimentalRuntime,
  loadR28M1Q4RuntimePackage,
  matmulQ4Vector,
  runtimeCapabilitySummary,
  runR28RT0MinimalInferenceSmoke,
  unpackQ4Nibbles,
  verifyCommittedShardChecksums
} from "../../src/browser_runtime/q4_runtime/index.ts";
import { handleRuntimeWorkerMessage } from "../../src/browser_runtime/runtime_worker.ts";
import { sha256Hex } from "../../src/browser_runtime/assets/checksum.ts";

function bytes(text) {
  return new TextEncoder().encode(text);
}

function arrayBuffer(bytesValue) {
  return bytesValue.buffer.slice(bytesValue.byteOffset, bytesValue.byteOffset + bytesValue.byteLength);
}

async function fixturePackage() {
  const shardBytes = new Uint8Array([0x10, 0x32, 0x54, 0x76]);
  const shardSha = await sha256Hex(shardBytes);
  const files = new Map([
    ["another_brain/model_assets/r28m1/shards/model-q4-00001.bin", shardBytes],
  ]);
  const assetManifest = {
    model_assets_admitted: true,
    product_model_admission: false,
    browser_admission: false,
    release_checkpoint_admission: false,
    same_origin_only: true,
    backend_inference: false,
    external_llm_api: false,
    doubao: false,
    hosted_vector_store: false,
    quantization: "q4",
    model_assets: [
      { role: "model_config", path: "another_brain/model_assets/r28m1/model.config.json", bytes: 2, sha256: "config" },
      { role: "quantization_manifest", path: "another_brain/model_assets/r28m1/quantization.manifest.json", bytes: 2, sha256: "quant" },
      { role: "checksum_manifest", path: "another_brain/model_assets/r28m1/checksums.sha256.json", bytes: 2, sha256: "checksums" },
      { role: "q4_shard", path: "another_brain/model_assets/r28m1/shards/model-q4-00001.bin", bytes: shardBytes.length, sha256: shardSha }
    ],
    tokenizer_assets: [
      { role: "runtime_tokenizer_metadata", path: "another_brain/model_assets/r28m1/tokenizer/tokenizer.json", bytes: 2, sha256: "tokenizer" }
    ]
  };
  const quantizationManifest = {
    quantization: "q4",
    same_origin_only: true,
    shards: [{ path: "another_brain/model_assets/r28m1/shards/model-q4-00001.bin", bytes: shardBytes.length, sha256: shardSha }]
  };
  const tokenizer = { browser_inference_ready: false };
  const checksums = { files: [{ path: "another_brain/model_assets/r28m1/shards/model-q4-00001.bin", bytes: shardBytes.length, sha256: shardSha }] };
  const jsonFiles = new Map([
    ["another_brain/asset_manifest.json", assetManifest],
    ["another_brain/model_assets/r28m1/model.config.json", { architecture: { n_embd: 2 } }],
    ["another_brain/model_assets/r28m1/quantization.manifest.json", quantizationManifest],
    ["another_brain/model_assets/r28m1/tokenizer/tokenizer.json", tokenizer],
    ["another_brain/model_assets/r28m1/checksums.sha256.json", checksums]
  ]);
  const fetcher = async (url) => {
    const path = new URL(url).pathname.replace(/^\/+/, "");
    if (jsonFiles.has(path)) return { ok: true, status: 200, json: async () => jsonFiles.get(path) };
    if (files.has(path)) return { ok: true, status: 200, arrayBuffer: async () => arrayBuffer(files.get(path)) };
    return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  };
  return { fetcher };
}

test("q4 unpack and matmul paths exist", () => {
  const unpacked = unpackQ4Nibbles(new Uint8Array([0x10, 0x32]), { scale: 1 });
  assert.deepEqual(Array.from(unpacked), [0, 1, 2, 3]);
  const output = matmulQ4Vector(unpacked, new Float32Array([1, 2]), 2, 2);
  assert.deepEqual(Array.from(output), [2, 8]);
});

test("runtime package loader verifies same-origin manifest and checksums", async () => {
  const { fetcher } = await fixturePackage();
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher, baseUrl: "https://example.test/" });
  assert.equal(runtimePackage.ok, true);
  assert.equal(runtimePackage.browser_worker_can_load_manifest, true);
  const checksum = await verifyCommittedShardChecksums(runtimePackage, { fetcher, baseUrl: "https://example.test/" });
  assert.equal(checksum.ok, true);
  assert.equal(checksum.checked_shards, 1);
});

test("runtime fails closed when q4 forward fixture lacks tensor metadata", async () => {
  const { fetcher } = await fixturePackage();
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher, baseUrl: "https://example.test/" });
  const runtime = new StaticQ4ExperimentalRuntime({ runtimePackage });
  await assert.rejects(() => runtime.load(), /model_config_insufficient_for_forward/);
});

test("runtime worker can load q4 manifest package and return blocker metadata", async () => {
  const { fetcher } = await fixturePackage();
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher, baseUrl: "https://example.test/" });
  const events = [];
  const result = await handleRuntimeWorkerMessage(
    { type: "load_q4_manifest", runtimePackage },
    { postMessage: (event) => events.push(event) }
  );
  assert.equal(result.type, "q4_capability");
  assert.equal(result.load.status, "loaded_manifest_only");
  assert.equal(result.capability.browser_worker_can_load_manifest, true);
  assert.equal(result.capability.real_browser_inference_admitted, false);
  assert.ok(events.some((event) => event.type === "state" && event.state === "loading_q4_manifest"));
});

test("minimal inference smoke fails gracefully and keeps fallback available", async () => {
  const { fetcher } = await fixturePackage();
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher, baseUrl: "https://example.test/" });
  const smoke = await runR28RT0MinimalInferenceSmoke(runtimePackage, { prompts: ["你好", "证据不足"] });
  assert.equal(smoke.real_inference_smoke_passed, false);
  assert.equal(smoke.blocker, R28RT0_REAL_INFERENCE_BLOCKER);
  assert.equal(smoke.fallback_still_works, true);
  assert.ok(smoke.prompt_results.every((item) => item.fallback_used));
});

test("capability summary keeps admission false", async () => {
  const { fetcher } = await fixturePackage();
  const runtimePackage = await loadR28M1Q4RuntimePackage({ fetcher, baseUrl: "https://example.test/" });
  const summary = runtimeCapabilitySummary(runtimePackage);
  assert.equal(summary.committed_model_manifest_exists, true);
  assert.equal(summary.tokenizer_exists, true);
  assert.equal(summary.q4_unpack_path_exists, true);
  assert.equal(summary.matmul_path_exists, true);
  assert.equal(summary.real_browser_inference_admitted, false);
  assert.equal(summary.release_admission, false);
});
