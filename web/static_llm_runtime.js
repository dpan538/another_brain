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

export async function loadStaticLlmManifest(profile = "hobby_static_llm_lite", options = {}) {
  const scope = options.scope || globalThis;
  const selectedProfile = normalizeProfile(profile);
  runtimeState.profile = selectedProfile;

  if (!hasFetch(scope)) {
    runtimeState.enabled = false;
    runtimeState.status = "disabled";
    runtimeState.reason = "fetch_unavailable";
    runtimeState.manifest = null;
    return getStaticLlmRuntimeStatus();
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
        return getStaticLlmRuntimeStatus();
      }
      runtimeState.enabled = true;
      runtimeState.status = "manifest_loaded";
      runtimeState.reason = "admitted_static_manifest_loaded";
      runtimeState.manifest = manifest;
      runtimeState.loadedAt = Date.now();
      return getStaticLlmRuntimeStatus();
    } catch {
      continue;
    }
  }

  runtimeState.enabled = false;
  runtimeState.status = "disabled";
  runtimeState.reason = "admitted_manifest_absent";
  runtimeState.manifest = null;
  return getStaticLlmRuntimeStatus();
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
