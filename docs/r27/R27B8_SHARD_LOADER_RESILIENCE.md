# R27B8 Shard Loader Resilience

R27B8 moves same-origin shard loading into `src/browser_runtime/assets/shard_loader.ts`.

## Loader Guarantees

- Reject external manifest URLs.
- Reject external shard URLs.
- Reject private/artifact paths.
- Require static budget metadata.
- Require sha256 for every declared shard.
- Verify sha256 before admitting a shard.
- Cache only verified shards.
- Retry fetches with a bounded cap.
- Honor abort signals.
- Report load progress.
- Return partial failure state when configured for fallback.

## Failure Handling

The loader distinguishes:

- `cache_miss`
- `cache_hit`
- `cache_stale`
- `retry`
- `verified`
- `failed`
- `asset_load_aborted`
- `sha256_mismatch`
- `non_same_origin_asset_rejected`

When `allowPartialFailure` is true, a failed shard returns an `ok: false` state with loaded shards, failures, progress, and fallback reason. When it is false, the loader raises `ShardLoadError` with the same state attached.

## Offline/Reload Smoke

R27B8 tests manifest-version invalidation and memory fallback behavior. This is readiness smoke for static reload/offline behavior, not proof that a future candidate model is product-ready.
