import { BrowserAssetCache } from "./asset_cache.ts";
import { verifySha256 } from "./checksum.ts";

export class ShardLoadError extends Error {
  constructor(message, state) {
    super(message);
    this.name = "ShardLoadError";
    this.state = state;
  }
}

export function isSameOriginUrl(value, base = "http://localhost/") {
  const url = new URL(value, base);
  const baseUrl = new URL(base);
  return url.origin === baseUrl.origin;
}

export function assertSameOriginAssetUrl(value, base = "http://localhost/") {
  if (!value || typeof value !== "string") throw new Error("missing_asset_path");
  if (value.startsWith("//")) throw new Error("external_asset_url_rejected");
  const url = new URL(value, base);
  if (!isSameOriginUrl(url.href, base)) throw new Error("non_same_origin_asset_rejected");
  if (url.pathname.includes("/artifacts/") || url.pathname.includes("/private")) {
    throw new Error("private_or_artifact_path_rejected");
  }
  return url;
}

function emit(onProgress, event) {
  if (typeof onProgress === "function") onProgress(event);
}

function requireBudgetMetadata(manifest) {
  const budget = manifest.budget || manifest.budget_metadata;
  if (!budget || typeof budget.max_total_static_bytes !== "number") {
    throw new Error("missing_budget_metadata");
  }
  if (typeof budget.model_weight_budget_bytes !== "number" && typeof manifest.total_bytes !== "number") {
    throw new Error("missing_model_budget_metadata");
  }
  return budget;
}

function manifestVersion(manifest) {
  return String(
    manifest.manifest_version
    || manifest.runtime_version
    || manifest.candidate_id
    || manifest.schema_version
    || "unversioned"
  );
}

function declaredShards(manifest) {
  const shards = manifest.tensor_shards || manifest.shards || [];
  if (!Array.isArray(shards) || shards.length === 0) throw new Error("missing_declared_shards");
  return shards;
}

async function fetchBytesWithRetry(url, options) {
  const fetchImpl = options.fetcher || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const retries = Math.max(0, Math.min(Number(options.maxRetries ?? 1), 5));
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal?.aborted) throw new Error("asset_load_aborted");
    try {
      emit(options.onProgress, { type: "shard", status: "fetching", url: url.href, attempt });
      const response = await fetchImpl(url.href, { signal: options.signal });
      if (!response.ok) throw new Error(`fetch_failed:${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      emit(options.onProgress, { type: "shard", status: "retry", url: url.href, attempt, error: error.message });
      if (attempt >= retries) break;
    }
  }
  throw lastError || new Error("fetch_failed");
}

async function loadOneShard({ shard, manifestUrl, version, cache, state, options }) {
  const shardUrl = assertSameOriginAssetUrl(shard.path, manifestUrl.href);
  if (!shard.sha256) throw new Error(`missing_sha256:${shard.path}`);
  const cached = await cache.get(shardUrl.href, { manifestVersion: version });
  if (cached.hit) {
    emit(options.onProgress, { type: "shard", status: "cache_hit", path: shard.path, cache_mode: cached.cache_mode });
    const cachedVerification = await verifySha256(cached.bytes, shard.sha256);
    if (cachedVerification.ok) {
      emit(options.onProgress, { type: "shard", status: "verified", path: shard.path, source: "cache" });
      return { path: shard.path, bytes: cached.bytes, declared: shard, cache_hit: true, sha256: cachedVerification.actual };
    }
    emit(options.onProgress, {
      type: "shard",
      status: "cache_stale",
      path: shard.path,
      reason: cachedVerification.reason
    });
  } else {
    emit(options.onProgress, { type: "shard", status: "cache_miss", path: shard.path, cache_mode: cached.cache_mode });
  }

  const bytes = await fetchBytesWithRetry(shardUrl, options);
  const verification = await verifySha256(bytes, shard.sha256);
  if (!verification.ok) throw new Error(`sha256_mismatch:${shard.path}`);
  await cache.put(shardUrl.href, bytes, { manifestVersion: version });
  emit(options.onProgress, { type: "shard", status: "verified", path: shard.path, source: "network" });
  state.bytesLoaded += bytes.byteLength;
  return { path: shard.path, bytes, declared: shard, cache_hit: false, sha256: verification.actual };
}

export async function loadShardedAssetManifest(options = {}) {
  const fetchImpl = options.fetcher || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch_unavailable");
  const manifestUrl = assertSameOriginAssetUrl(options.manifestUrl, options.baseUrl || "http://localhost/");
  emit(options.onProgress, { type: "manifest", status: "fetching", url: manifestUrl.href });
  const response = await fetchImpl(manifestUrl.href, { signal: options.signal });
  if (!response.ok) throw new Error(`manifest_fetch_failed:${response.status}`);
  const manifest = await response.json();
  requireBudgetMetadata(manifest);
  if (manifest.backend_inference !== false || manifest.external_runtime_dependency !== false) {
    throw new Error("runtime_dependency_flags_rejected");
  }

  const shards = declaredShards(manifest);
  const version = manifestVersion(manifest);
  const cache = options.cache || new BrowserAssetCache({ manifestVersion: version, env: options.env, caches: options.caches });
  await cache.invalidateByManifestVersion(version);

  const state = {
    ok: true,
    manifest,
    manifest_url: manifestUrl.href,
    manifest_version: version,
    loadedShards: [],
    failures: [],
    fallback_reason: cache.capabilities.fallback_reason,
    cache: {
      mode: cache.mode(),
      capabilities: cache.capabilities
    },
    progress: {
      loaded_shards: 0,
      total_shards: shards.length,
      bytes_loaded: 0,
      total_declared_bytes: shards.reduce((total, shard) => total + Number(shard.bytes || 0), 0)
    }
  };

  emit(options.onProgress, {
    type: "manifest",
    status: "loaded",
    manifest_version: version,
    total_shards: shards.length,
    cache_mode: state.cache.mode
  });

  for (const shard of shards) {
    try {
      if (options.signal?.aborted) throw new Error("asset_load_aborted");
      state.bytesLoaded = state.progress.bytes_loaded;
      const loaded = await loadOneShard({ shard, manifestUrl, version, cache, state, options });
      state.loadedShards.push(loaded);
      state.progress.loaded_shards = state.loadedShards.length;
      state.progress.bytes_loaded += loaded.bytes.byteLength;
      emit(options.onProgress, {
        type: "progress",
        loaded_shards: state.progress.loaded_shards,
        total_shards: state.progress.total_shards,
        bytes_loaded: state.progress.bytes_loaded,
        total_declared_bytes: state.progress.total_declared_bytes
      });
    } catch (error) {
      state.ok = false;
      state.fallback_reason = `shard_load_failed:${shard.path}:${error.message}`;
      state.failures.push({ path: shard.path, reason: error.message });
      emit(options.onProgress, { type: "shard", status: "failed", path: shard.path, error: error.message });
      if (options.allowPartialFailure !== true) {
        throw new ShardLoadError("partial_shard_load_failed", state);
      }
      break;
    }
  }

  return state;
}
