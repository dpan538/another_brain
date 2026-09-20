function getScope(scope) {
  return scope || globalThis;
}

function plainObjectFromLimits(limits = {}) {
  const out = {};
  for (const key of [
    "maxBufferSize",
    "maxStorageBufferBindingSize",
    "maxComputeWorkgroupStorageSize",
    "maxComputeInvocationsPerWorkgroup",
    "maxBindGroups"
  ]) {
    if (typeof limits[key] === "number") out[key] = limits[key];
  }
  return out;
}

export async function detectWebGpuSupport(scope = globalThis) {
  const root = getScope(scope);
  const gpu = root.navigator?.gpu;
  if (!gpu) {
    return {
      available: false,
      adapterName: "",
      limits: {},
      features: [],
      reason: "navigator.gpu unavailable"
    };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return {
        available: false,
        adapterName: "",
        limits: {},
        features: [],
        reason: "requestAdapter returned null"
      };
    }
    const info = typeof adapter.requestAdapterInfo === "function" ? await adapter.requestAdapterInfo().catch(() => ({})) : {};
    return {
      available: true,
      adapterName: info.description || info.vendor || info.architecture || "",
      limits: plainObjectFromLimits(adapter.limits || {}),
      features: Array.from(adapter.features || [])
    };
  } catch (error) {
    return {
      available: false,
      adapterName: "",
      limits: {},
      features: [],
      reason: error?.message || "webgpu detection failed"
    };
  }
}

export function detectWasmSupport(scope = globalThis) {
  const root = getScope(scope);
  return {
    available: typeof root.WebAssembly === "object",
    simdLikely: typeof root.WebAssembly === "object",
    threadsLikely: typeof root.SharedArrayBuffer === "function"
  };
}

export function detectWorkerSupport(scope = globalThis) {
  const root = getScope(scope);
  return { available: typeof root.Worker === "function" };
}

export function detectOpfsSupport(scope = globalThis) {
  const root = getScope(scope);
  return { available: typeof root.navigator?.storage?.getDirectory === "function" };
}

export function detectCacheApiSupport(scope = globalThis) {
  const root = getScope(scope);
  return { available: typeof root.caches?.open === "function" };
}

export function detectIndexedDbSupport(scope = globalThis) {
  const root = getScope(scope);
  return { available: typeof root.indexedDB === "object" };
}

export async function detectStorageEstimate(scope = globalThis) {
  const root = getScope(scope);
  try {
    if (typeof root.navigator?.storage?.estimate !== "function") {
      return { available: false, quota: 0, usage: 0, reason: "navigator.storage.estimate unavailable" };
    }
    const estimate = await root.navigator.storage.estimate();
    return {
      available: true,
      quota: Number(estimate.quota || 0),
      usage: Number(estimate.usage || 0),
      remaining: Math.max(0, Number(estimate.quota || 0) - Number(estimate.usage || 0))
    };
  } catch (error) {
    return { available: false, quota: 0, usage: 0, reason: error?.message || "storage estimate failed" };
  }
}

export function detectMobileSafariRisk(scope = globalThis) {
  const root = getScope(scope);
  const ua = String(root.navigator?.userAgent || "");
  const mobileSafari = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return {
    mobileSafari,
    risk: mobileSafari ? "webgpu_storage_and_worker_support_may_vary" : ""
  };
}

export function estimateGpuMemoryClass(webgpuInfo = {}) {
  if (!webgpuInfo.available) return "none";
  const maxBuffer = Number(webgpuInfo.limits?.maxBufferSize || 0);
  if (maxBuffer >= 1_000_000_000) return "high";
  if (maxBuffer >= 256_000_000) return "medium";
  return "low";
}

export function selectInferenceBackend({
  preferWebGpu = true,
  runtimeProfile = "standard",
  answerSlaMs = 3000,
  capabilities = {}
} = {}) {
  const webgpuAvailable = Boolean(capabilities.webgpu?.available);
  const wasmAvailable = capabilities.wasm?.available !== false;
  const warnings = [];
  const profile = String(runtimeProfile || "standard");

  if (/personal_200m|experimental|full/.test(profile) && !webgpuAvailable) {
    warnings.push(`${profile} is a legacy comparison profile and requires WebGPU; degrade to standard local runtime`);
  }
  if (answerSlaMs > 3000) warnings.push("answer SLA exceeds R17 3000ms target");

  if (preferWebGpu && webgpuAvailable) {
    return {
      recommendedBackend: "webgpu",
      recommendedProfile: /personal_200m|experimental|full/.test(profile) ? profile : "standard",
      warnings
    };
  }
  if (wasmAvailable) {
    return {
      recommendedBackend: "wasm",
      recommendedProfile: /personal_200m|experimental|full/.test(profile) ? "standard" : profile,
      warnings
    };
  }
  return {
    recommendedBackend: "none",
    recommendedProfile: "lite",
    warnings: [...warnings, "No WebGPU or WASM support detected; deterministic lite runtime only"]
  };
}

export async function detectBrowserInferenceProfile(options = {}) {
  const scope = options.scope || globalThis;
  const webgpu = await detectWebGpuSupport(scope);
  const wasm = detectWasmSupport(scope);
  const worker = detectWorkerSupport(scope);
  const storage = {
    opfs: detectOpfsSupport(scope).available,
    cacheApi: detectCacheApiSupport(scope).available,
    indexedDb: detectIndexedDbSupport(scope).available,
    estimate: await detectStorageEstimate(scope)
  };
  const mobileSafari = detectMobileSafariRisk(scope);
  const selection = selectInferenceBackend({
    preferWebGpu: options.preferWebGpu !== false,
    runtimeProfile: options.runtimeProfile || "standard",
    answerSlaMs: options.answerSlaMs || 3000,
    capabilities: { webgpu, wasm, worker, storage }
  });

  return {
    webgpu,
    wasm,
    worker,
    storage,
    mobileSafari,
    gpuMemoryClass: estimateGpuMemoryClass(webgpu),
    recommendedBackend: selection.recommendedBackend,
    recommendedProfile: selection.recommendedProfile,
    warnings: selection.warnings
  };
}
