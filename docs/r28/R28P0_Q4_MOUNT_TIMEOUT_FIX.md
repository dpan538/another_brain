# R28P0 Q4 Mount Timeout Fix

R28P0 addresses the preview failure where q4 assets were fetchable but browser mount repeatedly ended at `self_check_timeout`, then displayed `q4 forward: 失败`.

## Root Cause

- The deep self-check was capped at 15 seconds while first-load mobile/preview q4 warmup can exceed 30 seconds.
- The self-check used a separate worker that cold-loaded q4 assets and was terminated on timeout, so the chat runtime worker did not benefit from the work.
- Worker module query strings still used the SHIP0 cache key, allowing browsers to reuse older worker modules after UI updates.
- `runtime_mode.json` still advertised the SHIP0 cache version, so the model asset cache namespace was not force-invalidated by the hotfix.

## Fix

- Increase deep q4 warmup to 90 seconds with a 120 second hard cap.
- Run default q4 self-check smoke through the persistent `runtime_worker`, so a successful warmup keeps the tensor store hot for chat.
- Keep the isolated `self_check_worker` as an explicit fallback path only.
- Bump app/runtime/worker/q4 module query strings to `r28p0-q4-mount-timeout-fix`.
- Fetch `runtime_mode.json` with a P0 cache-bust and `no-store`.
- Update UI/cache metadata to the P0 version without changing model shard paths, bytes, or checksums.

## P0B Primary Mount State Fix

The first P0 preview still showed `Plan B` while the primary q4 mount had not failed. That was a status-machine bug:

- `summarizeQ4RetryPlan([])` reports `retrying/q4_retry_plan_not_complete`, which is correct internally but must not be surfaced as a failed retry.
- Attempt 1 now emits `primary_mount`, not `retrying`.
- Plan B UI is only allowed when attempt 1 has completed and failed, or when the active attempt is greater than 1.
- `q4_retry_plan_not_complete` is hidden from failure copy because it is a pending state, not a blocker.
- The visible version is bumped to `r28p0b-primary-q4-mount-state`.

## Non-Claims

- Not product model admission.
- Not browser admission.
- Not release checkpoint admission.
- No training.
- No new model weights.
- No new q4 shards.
- No backend inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
