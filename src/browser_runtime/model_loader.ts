import { SyntheticTinyRuntime } from "./generation_loop.ts";

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

export function isSameOriginUrl(value, base = "http://localhost") {
  const url = new URL(value, base);
  const baseUrl = new URL(base);
  return url.origin === baseUrl.origin;
}

export function assertSameOriginPath(path, base = "http://localhost") {
  if (!path || typeof path !== "string") throw new Error("missing_asset_path");
  if (path.startsWith("//")) throw new Error("external_asset_url_rejected");
  const url = new URL(path, base);
  if (!isSameOriginUrl(url.href, base)) throw new Error("non_same_origin_asset_rejected");
  if (url.pathname.includes("/artifacts/") || url.pathname.includes("/private")) {
    throw new Error("private_or_artifact_path_rejected");
  }
  return url;
}

async function sha256Hex(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export async function verifySha256(bytes, expected) {
  if (!expected) return true;
  return (await sha256Hex(bytes)) === expected;
}

function requireBudgetMetadata(manifest) {
  const budget = manifest.budget || manifest.budget_metadata;
  if (!budget || typeof budget.max_total_static_bytes !== "number" || typeof budget.model_weight_budget_bytes !== "number") {
    throw new Error("missing_budget_metadata");
  }
  return budget;
}

export async function loadStaticShardManifest({ manifestUrl, baseUrl, fetcher }) {
  const fetchImpl = fetcher || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const manifestResolved = assertSameOriginPath(manifestUrl, baseUrl);
  const response = await fetchImpl(manifestResolved.href);
  if (!response.ok) throw new Error(`manifest_fetch_failed:${response.status}`);
  const manifest = await response.json();
  requireBudgetMetadata(manifest);
  if (manifest.backend_inference !== false || manifest.external_runtime_dependency !== false) {
    throw new Error("runtime_dependency_flags_rejected");
  }
  const shards = manifest.tensor_shards || manifest.shards || [];
  if (!Array.isArray(shards) || shards.length === 0) throw new Error("missing_declared_shards");

  const loadedShards = [];
  for (const shard of shards) {
    const shardUrl = assertSameOriginPath(shard.path, manifestResolved.href);
    const shardResponse = await fetchImpl(shardUrl.href);
    if (!shardResponse.ok) throw new Error(`shard_fetch_failed:${shard.path}`);
    const bytes = new Uint8Array(await shardResponse.arrayBuffer());
    if (!(await verifySha256(bytes, shard.sha256))) throw new Error(`sha256_mismatch:${shard.path}`);
    loadedShards.push({ path: shard.path, bytes, declared: shard });
  }
  return { manifest, loadedShards };
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
