const STATIC_LLM_PROFILES = Object.freeze({
  hobby_static_llm_lite: Object.freeze({
    manifestPaths: Object.freeze([
      "/static_llm/manifest.hobby.json",
      "/static_llm/hobby_static_llm_lite/manifest.json",
      "/static_llm/manifest.json"
    ])
  }),
  pro_static_llm_full: Object.freeze({
    manifestPaths: Object.freeze([
      "/static_llm/manifest.pro.json",
      "/static_llm/pro_static_llm_full/manifest.json",
      "/static_llm/manifest.json"
    ])
  })
});

const STATIC_LLM_CACHE_NAME = "another-brain-static-llm-assets-v1";

const runtimeState = {
  enabled: false,
  status: "disabled",
  reason: "static_llm_disabled_until_manifest_admission",
  profile: "",
  manifest: null,
  loadedAt: 0,
  cacheName: STATIC_LLM_CACHE_NAME
};

function hasFetch(scope = globalThis) {
  return typeof scope.fetch === "function";
}

function getOrigin(scope = globalThis) {
  return String(scope.location?.origin || "");
}

function normalizeProfile(profile) {
  return STATIC_LLM_PROFILES[profile] ? profile : "hobby_static_llm_lite";
}

function isRelativeSameOriginPath(value) {
  const text = String(value || "");
  if (!text) return false;
  if (/^(https?:)?\/\//i.test(text)) return false;
  if (/^(data|blob|file):/i.test(text)) return false;
  if (/(^|\/)\.\.(\/|$)/.test(text)) return false;
  return text.startsWith("/") || text.startsWith("static_llm/");
}

function runtimeStatusResult(options = {}, manifest = null) {
  const status = getStaticLlmRuntimeStatus();
  return options.includeManifest ? { ...status, manifest } : status;
}

export async function loadStaticLlmManifest(profile = "hobby_static_llm_lite", options = {}) {
  const scope = options.scope || globalThis;
  const selectedProfile = normalizeProfile(profile);
  runtimeState.profile = selectedProfile;

  if (!hasFetch(scope)) {
    runtimeState.enabled = false;
    runtimeState.status = "disabled";
    runtimeState.reason = "fetch_unavailable";
    runtimeState.manifest = null;
    return runtimeStatusResult(options, null);
  }

  for (const manifestPath of STATIC_LLM_PROFILES[selectedProfile].manifestPaths) {
    if (!validateSameOriginAssetUrl(manifestPath, scope).ok) continue;
    try {
      const response = await scope.fetch(manifestPath, { cache: "no-store" });
      if (!response?.ok) continue;
      const manifest = await response.json();
      if (
        manifest?.profile !== selectedProfile ||
        manifest?.same_origin_only !== true ||
        manifest?.external_urls_allowed !== false ||
        manifest?.backend_required !== false ||
        /example/i.test(String(manifest?.review_status || ""))
      ) {
        runtimeState.enabled = false;
        runtimeState.status = "disabled";
        runtimeState.reason = "manifest_not_admitted";
        runtimeState.manifest = null;
        return runtimeStatusResult(options, null);
      }
      runtimeState.enabled = true;
      runtimeState.status = "manifest_loaded";
      runtimeState.reason = "admitted_static_manifest_loaded";
      runtimeState.manifest = manifest;
      runtimeState.loadedAt = Date.now();
      return runtimeStatusResult(options, manifest);
    } catch {
      continue;
    }
  }

  runtimeState.enabled = false;
  runtimeState.status = "disabled";
  runtimeState.reason = "admitted_manifest_absent";
  runtimeState.manifest = null;
  return runtimeStatusResult(options, null);
}

export function selectStaticLlmProfile({ plan = "hobby", device = {}, userFlag = false } = {}) {
  if (userFlag !== true) {
    return {
      enabled: false,
      profile: "",
      reason: "static_llm_disabled_by_default"
    };
  }
  const wantsPro = /pro|full/i.test(String(plan || ""));
  const highMemoryDevice = /high/i.test(String(device.gpuMemoryClass || "")) || Number(device.storageQuotaBytes || 0) >= 1_500_000_000;
  return {
    enabled: true,
    profile: wantsPro && highMemoryDevice ? "pro_static_llm_full" : "hobby_static_llm_lite",
    reason: wantsPro && !highMemoryDevice ? "pro_profile_requires_larger_browser_budget" : "user_enabled_static_llm_candidate"
  };
}

export function validateSameOriginAssetUrl(url, scope = globalThis) {
  const value = String(url || "");
  if (isRelativeSameOriginPath(value)) return { ok: true, url: value, sameOrigin: true };
  try {
    const origin = getOrigin(scope);
    if (!origin) return { ok: false, reason: "absolute_url_requires_browser_origin" };
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return { ok: false, reason: "external_origin_rejected", origin: parsed.origin };
    if (!parsed.pathname.startsWith("/static_llm/")) return { ok: false, reason: "asset_path_must_be_static_llm" };
    return { ok: true, url: parsed.pathname + parsed.search, sameOrigin: true };
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
}

export async function fetchStaticLlmAsset(file, options = {}) {
  const scope = options.scope || globalThis;
  const path = typeof file === "string" ? file : file?.path;
  const check = validateSameOriginAssetUrl(path, scope);
  if (!check.ok) return { ok: false, reason: check.reason || "invalid_asset_url" };
  if (!hasFetch(scope)) return { ok: false, reason: "fetch_unavailable" };
  const response = await scope.fetch(check.url, {
    cache: options.cache || "force-cache",
    integrity: options.integrity || undefined
  });
  if (!response?.ok) return { ok: false, reason: "asset_fetch_failed", status: response?.status || 0 };
  return { ok: true, response, url: check.url };
}

export function resolveStaticLlmAssetUrl(file, scope = globalThis) {
  const path = typeof file === "string" ? file : file?.path;
  const check = validateSameOriginAssetUrl(path, scope);
  if (!check.ok) return { ok: false, reason: check.reason || "invalid_asset_url", url: "" };
  return { ok: true, url: check.url };
}

export function getStaticLlmAssetCacheKey(file) {
  const path = typeof file === "string" ? file : file?.path;
  const sha = typeof file === "object" && file ? file.sha256 || "" : "";
  return `${STATIC_LLM_CACHE_NAME}:${String(path || "")}:${String(sha || "unhashed")}`;
}

export async function verifyAssetSha256(arrayBuffer, expectedSha256) {
  const expected = String(expectedSha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest !== "function") return false;
  const digest = await subtle.digest("SHA-256", arrayBuffer);
  const actual = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return actual === expected;
}

export async function streamAndVerifyStaticLlmAsset(file, options = {}) {
  const fetched = await fetchStaticLlmAsset(file, options);
  if (!fetched.ok) return fetched;
  const expectedBytes = Number(file?.bytes || 0);
  const buffer = await fetched.response.arrayBuffer();
  if (expectedBytes > 0 && buffer.byteLength !== expectedBytes) {
    return {
      ok: false,
      reason: "asset_size_mismatch",
      url: fetched.url,
      expectedBytes,
      actualBytes: buffer.byteLength
    };
  }
  const sha256Ok = await verifyAssetSha256(buffer, file?.sha256 || "");
  if (!sha256Ok) {
    return {
      ok: false,
      reason: "asset_sha256_mismatch",
      url: fetched.url,
      expectedSha256: file?.sha256 || ""
    };
  }
  if (options.cacheVerified === true) {
    await cacheStaticLlmAsset(file, buffer, options).catch(() => null);
  }
  return {
    ok: true,
    url: fetched.url,
    cacheKey: getStaticLlmAssetCacheKey(file),
    bytes: buffer.byteLength,
    sha256Ok,
    role: file?.role || "",
    arrayBuffer: options.returnBuffer === false ? null : buffer
  };
}

export async function openStaticLlmCache(scope = globalThis) {
  if (typeof scope.caches?.open !== "function") return null;
  return scope.caches.open(STATIC_LLM_CACHE_NAME);
}

export async function cacheStaticLlmAsset(file, responseOrBuffer, options = {}) {
  const scope = options.scope || globalThis;
  const cache = await openStaticLlmCache(scope);
  if (!cache) return { ok: false, reason: "cache_api_unavailable" };
  const path = typeof file === "string" ? file : file?.path;
  const check = validateSameOriginAssetUrl(path, scope);
  if (!check.ok) return { ok: false, reason: check.reason || "invalid_asset_url" };
  const value =
    typeof Response !== "undefined" && responseOrBuffer instanceof Response
      ? responseOrBuffer.clone()
      : new Response(responseOrBuffer);
  await cache.put(check.url, value);
  return { ok: true, cacheName: STATIC_LLM_CACHE_NAME, url: check.url };
}

export async function loadStaticLlmAssets(manifest, options = {}) {
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, reason: "manifest_required", assets: [], failures: [] };
  }
  if (manifest.same_origin_only !== true || manifest.external_urls_allowed !== false || manifest.backend_required !== false) {
    return { ok: false, reason: "manifest_policy_rejected", assets: [], failures: ["manifest_policy_rejected"] };
  }
  const roles = new Set(options.roles || ["tokenizer", "config", "metadata"]);
  const includeWeights = options.includeWeights === true;
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const selectedFiles = files.filter((file) => {
    if (file.role === "weights" && !includeWeights) return false;
    return roles.has(file.role) || (includeWeights && file.role === "weights");
  });
  const assets = [];
  const failures = [];
  for (const file of selectedFiles) {
    const verified = await streamAndVerifyStaticLlmAsset(file, {
      ...options,
      returnBuffer: file.role !== "weights" || includeWeights === true,
      cacheVerified: options.cacheVerified === true
    });
    if (!verified.ok) {
      failures.push({ path: file.path, reason: verified.reason || "asset_load_failed" });
      continue;
    }
    assets.push({ file, ...verified });
  }
  return {
    ok: failures.length === 0,
    modelId: manifest.model_id || "",
    assets,
    failures,
    skippedWeightFiles: files.filter((file) => file.role === "weights" && !includeWeights).map((file) => file.path)
  };
}

function decodeUtf8(arrayBuffer) {
  if (typeof TextDecoder === "function") return new TextDecoder().decode(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

export async function loadTokenizerAndConfig(manifest, options = {}) {
  const loaded = await loadStaticLlmAssets(manifest, { ...options, roles: ["tokenizer", "config"], includeWeights: false });
  if (!loaded.ok) return { ok: false, reason: "tokenizer_config_asset_load_failed", ...loaded };
  const tokenizerAsset = loaded.assets.find((asset) => asset.file.role === "tokenizer");
  const configAsset = loaded.assets.find((asset) => asset.file.role === "config");
  if (!tokenizerAsset || !configAsset) {
    return { ok: false, reason: "tokenizer_or_config_missing", tokenizer: null, config: null, assets: loaded.assets };
  }
  try {
    const tokenizer = JSON.parse(decodeUtf8(tokenizerAsset.arrayBuffer));
    const config = JSON.parse(decodeUtf8(configAsset.arrayBuffer));
    return { ok: true, tokenizer, config, assets: loaded.assets };
  } catch (error) {
    return { ok: false, reason: "tokenizer_config_json_parse_failed", error: error?.message || String(error), assets: loaded.assets };
  }
}

export function loadModelShardHeaders(manifest) {
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  const failures = [];
  const shards = files
    .filter((file) => file.role === "weights")
    .map((file) => {
      const sameOrigin = validateSameOriginAssetUrl(file.path);
      if (!sameOrigin.ok) failures.push({ path: file.path, reason: sameOrigin.reason || "invalid_asset_url" });
      return {
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
        required: file.required === true,
        sameOrigin: sameOrigin.ok,
        cacheKey: getStaticLlmAssetCacheKey(file)
      };
    });
  return {
    ok: failures.length === 0,
    modelId: manifest?.model_id || "",
    shardCount: shards.length,
    totalShardBytes: shards.reduce((sum, shard) => sum + Number(shard.bytes || 0), 0),
    maxShardBytes: shards.reduce((max, shard) => Math.max(max, Number(shard.bytes || 0)), 0),
    shards,
    failures
  };
}

export function getStaticLlmRuntimeStatus() {
  return {
    enabled: runtimeState.enabled,
    status: runtimeState.status,
    reason: runtimeState.reason,
    profile: runtimeState.profile,
    manifestLoaded: Boolean(runtimeState.manifest),
    modelId: runtimeState.manifest?.model_id || "",
    cacheName: runtimeState.cacheName,
    loadedAt: runtimeState.loadedAt
  };
}

export function createStaticLlmDraftGenerator(options = {}) {
  const status = getStaticLlmRuntimeStatus();
  return {
    available: false,
    backend: options.backend || status.profile || "static_llm_unavailable",
    status,
    async generateDraft() {
      return {
        ok: false,
        unavailable: true,
        reason: status.manifestLoaded ? "inference_backend_not_admitted" : "static_llm_model_absent",
        text: "",
        draft: "",
        usedBackend: false
      };
    }
  };
}

if (typeof globalThis.window === "object" && !globalThis.window.exportAnotherBrainStaticLlmStatus) {
  globalThis.window.exportAnotherBrainStaticLlmStatus = getStaticLlmRuntimeStatus;
}
