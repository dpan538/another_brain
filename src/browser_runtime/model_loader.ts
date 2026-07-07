import { SyntheticTinyRuntime } from "./generation_loop.ts";
import { StaticQ4ExperimentalRuntime, loadR28M1Q4RuntimePackage } from "./q4_runtime/index.ts";
import {
  assertSameOriginAssetUrl,
  isSameOriginUrl,
  loadShardedAssetManifest
} from "./assets/shard_loader.ts";
import { verifySha256 as verifySha256Detailed } from "./assets/checksum.ts";
import { createTraceEvent } from "./trace/trace_event.ts";

export const RUNTIME_MODES = Object.freeze([
  "mock",
  "synthetic_tiny",
  "static_q4_experimental",
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
  if (mode === "static_q4_experimental") {
    const runtimePackage = options.runtimePackage || await loadR28M1Q4RuntimePackage(options);
    const runtime = new StaticQ4ExperimentalRuntime({
      runtimePackage,
      fetcher: options.fetcher,
      baseUrl: options.baseUrl
    });
    const load = await runtime.load();
    return {
      mode,
      runtime,
      status: load.status,
      product_model: false,
      browser_admission: false,
      tokenizer_decode_ready: load.tokenizer_decode_ready,
      tokenizer_exact_decode_ready: load.tokenizer_exact_decode_ready,
      tokenizer_decode_status: load.tokenizer_decode_status,
      tokenizer_limitation: load.tokenizer_limitation,
      trace_events: [
        createTraceEvent("model_manifest_loaded", { mode }),
        createTraceEvent("q4_shards_verified", { manifest_loaded: true }),
        createTraceEvent("tokenizer_ready", { tokenizer: load.tokenizer_decode_status || "none" })
      ]
    };
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
