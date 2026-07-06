import { SyntheticTinyRuntime } from "./generation_loop.ts";
import {
  assertSameOriginAssetUrl,
  isSameOriginUrl,
  loadShardedAssetManifest
} from "./assets/shard_loader.ts";
import { verifySha256 as verifySha256Detailed } from "./assets/checksum.ts";

export const RUNTIME_MODES = Object.freeze([
  "mock",
  "synthetic_tiny",
  "static_shard_manifest_experimental",
  "onnx_webgpu_experimental",
  "wasm_fallback_experimental"
]);

export function normalizeRuntimeMode(mode) {
  return RUNTIME_MODES.includes(mode) ? mode : "synthetic_tiny";
}

export function assertSameOriginPath(path, base = "http://localhost") {
  return assertSameOriginAssetUrl(path, base);
}

export async function verifySha256(bytes, expected) {
  if (!expected) return true;
  return (await verifySha256Detailed(bytes, expected)).ok;
}

export { isSameOriginUrl };

export async function loadStaticShardManifest(options) {
  const state = await loadShardedAssetManifest({ ...options, allowPartialFailure: false });
  return { manifest: state.manifest, loadedShards: state.loadedShards, asset_state: state };
}

export async function loadRuntimeModel(options = {}) {
  const mode = normalizeRuntimeMode(options.mode || "synthetic_tiny");
  if (mode === "mock" || mode === "synthetic_tiny" || mode === "wasm_fallback_experimental") {
    const runtime = new SyntheticTinyRuntime({ mode });
    await runtime.load();
    return { mode, runtime, status: "loaded", product_model: false };
  }
  if (mode === "static_shard_manifest_experimental") {
    const shardState = await loadStaticShardManifest(options);
    const runtime = new SyntheticTinyRuntime({ mode });
    await runtime.load();
    return { mode, runtime, shardState, status: "loaded_manifest_only", product_model: false };
  }
  if (mode === "onnx_webgpu_experimental") {
    return {
      mode,
      runtime: new SyntheticTinyRuntime({ mode }),
      status: "blocked_no_onnx_bundle",
      product_model: false,
      blocker: "onnx runtime is not bundled in R27B1B"
    };
  }
  throw new Error(`unsupported_runtime_mode:${mode}`);
}
