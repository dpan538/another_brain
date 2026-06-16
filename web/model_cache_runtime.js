export const MODEL_CACHE_POLICY = Object.freeze({
  version: "r20-retrieval-pilot",
  allowPrivateData: false,
  allowWeightsInRepo: false,
  cacheNames: {
    immutableArtifacts: "another-brain-model-artifacts-v1",
    indexes: "another-brain-indexes-v1"
  }
});

export function buildModelManifest({ id = "", url = "", integrity = "", sizeBytes = 0, kind = "embedding" } = {}) {
  return {
    id,
    url,
    integrity,
    sizeBytes,
    kind,
    version: MODEL_CACHE_POLICY.version,
    privateData: false
  };
}

export async function detectModelCacheSupport(scope = globalThis) {
  return {
    cacheApi: typeof scope.caches?.open === "function",
    indexedDb: typeof scope.indexedDB === "object",
    opfs: typeof scope.navigator?.storage?.getDirectory === "function"
  };
}

export async function openArtifactCache(scope = globalThis) {
  if (typeof scope.caches?.open !== "function") return null;
  return scope.caches.open(MODEL_CACHE_POLICY.cacheNames.immutableArtifacts);
}

