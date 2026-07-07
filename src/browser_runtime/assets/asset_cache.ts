import { probeAssetCacheCapabilities } from "./cache_capability.ts";
import { toUint8Array } from "./checksum.ts";

function versionedMemoryKey(url, version) {
  return `${version || "unversioned"}::${url}`;
}

function versionedCacheUrl(url, version) {
  const resolved = new URL(url);
  resolved.searchParams.set("__ab_manifest_version", version || "unversioned");
  return resolved.href;
}

export class BrowserAssetCache {
  constructor(options = {}) {
    this.cacheName = options.cacheName || "another-brain-model-shards";
    this.manifestVersion = options.manifestVersion || "unversioned";
    this.env = options.env || globalThis;
    this.caches = options.caches || this.env.caches;
    this.Response = options.Response || this.env.Response;
    this.memory = options.memory || new Map();
    this.capabilities = probeAssetCacheCapabilities(this.env);
    this.cacheStorageUsable = Boolean(
      this.capabilities.cache_storage_available
      && this.caches
      && typeof this.caches.open === "function"
      && typeof this.Response === "function"
    );
  }

  mode() {
    return this.cacheStorageUsable ? "cache_storage" : "memory_fallback";
  }

  async openCache() {
    if (!this.cacheStorageUsable) return null;
    return this.caches.open(this.cacheName);
  }

  async get(url, options = {}) {
    const version = options.manifestVersion || this.manifestVersion;
    if (this.cacheStorageUsable) {
      const cache = await this.openCache();
      const response = await cache.match(versionedCacheUrl(url, version));
      if (response) {
        return {
          hit: true,
          bytes: new Uint8Array(await response.arrayBuffer()),
          cache_mode: "cache_storage"
        };
      }
    }
    const memoryKey = versionedMemoryKey(url, version);
    if (this.memory.has(memoryKey)) {
      return {
        hit: true,
        bytes: new Uint8Array(this.memory.get(memoryKey)),
        cache_mode: "memory_fallback"
      };
    }
    return { hit: false, bytes: null, cache_mode: this.mode() };
  }

  async put(url, bytes, options = {}) {
    const version = options.manifestVersion || this.manifestVersion;
    const normalized = toUint8Array(bytes);
    if (this.cacheStorageUsable) {
      const cache = await this.openCache();
      await cache.put(versionedCacheUrl(url, version), new this.Response(normalized.slice()));
      return { stored: true, cache_mode: "cache_storage" };
    }
    this.memory.set(versionedMemoryKey(url, version), normalized.slice());
    return { stored: true, cache_mode: "memory_fallback" };
  }

  async invalidateByManifestVersion(activeVersion) {
    this.manifestVersion = activeVersion || "unversioned";
    for (const key of Array.from(this.memory.keys())) {
      if (!key.startsWith(`${this.manifestVersion}::`)) this.memory.delete(key);
    }
    if (!this.cacheStorageUsable) {
      return { invalidated: true, cache_mode: "memory_fallback" };
    }
    const cache = await this.openCache();
    if (typeof cache.keys !== "function" || typeof cache.delete !== "function") {
      return { invalidated: false, cache_mode: "cache_storage", reason: "cache_key_iteration_unavailable" };
    }
    const keys = await cache.keys();
    await Promise.all(keys.map(async (request) => {
      const url = new URL(request.url);
      if (url.searchParams.get("__ab_manifest_version") !== this.manifestVersion) {
        await cache.delete(request);
      }
    }));
    return { invalidated: true, cache_mode: "cache_storage" };
  }
}
