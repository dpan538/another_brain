export function probeAssetCacheCapabilities(env = globalThis) {
  const cacheStorageAvailable = typeof env.caches?.open === "function";
  const cacheDeleteAvailable = typeof env.caches?.delete === "function";
  const indexedDbAvailable = typeof env.indexedDB !== "undefined";
  const storageEstimateAvailable = typeof env.navigator?.storage?.estimate === "function";
  const online = env.navigator?.onLine !== false;
  return {
    cache_storage_available: cacheStorageAvailable,
    cache_delete_available: cacheDeleteAvailable,
    indexed_db_available: indexedDbAvailable,
    storage_estimate_available: storageEstimateAvailable,
    offline_static_cache_supported: cacheStorageAvailable || indexedDbAvailable,
    online,
    fallback_required: !cacheStorageAvailable,
    fallback_reason: cacheStorageAvailable ? "" : "cache_storage_unavailable"
  };
}
