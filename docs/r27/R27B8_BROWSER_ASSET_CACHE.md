# R27B8 Browser Asset Cache

R27B8 adds a browser-side cache layer for future same-origin model shards. It does not add or commit model assets.

## Runtime Pieces

- `src/browser_runtime/assets/cache_capability.ts` detects CacheStorage, IndexedDB, storage estimate support, and online/offline state.
- `src/browser_runtime/assets/asset_cache.ts` wraps CacheStorage when available and falls back to an in-memory cache when it is not.
- Cache entries are keyed by manifest version so a newer candidate manifest can invalidate older shard entries.

## Cache Policy

- Model shards must be same-origin.
- Shards are cached only after sha256 verification passes.
- Manifest version changes invalidate older cached shard entries.
- CacheStorage is preferred.
- IndexedDB is detected for readiness reporting, but R27B8 does not introduce an IndexedDB persistence implementation.
- If CacheStorage is unavailable, the loader uses memory fallback and reports the fallback reason.

## UI Surface

The static chat shell now shows:

- asset cache mode
- asset progress
- verification status
- offline/cache readiness

The default static demo still shows no model assets because no product candidate is admitted or bundled.
