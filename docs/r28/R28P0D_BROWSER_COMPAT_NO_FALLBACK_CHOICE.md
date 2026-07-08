# R28P0D Browser Compat No Fallback Choice

R28P0D keeps q4 as the default browser runtime path and removes any user-facing fast/lightweight/fallback choice. Users see a simple 鳄鱼 chat surface; Dashboard keeps q4, tokenizer, worker, cache, and blocker diagnostics.

## Compatibility Targets

- Safari mobile and desktop: guarded static q4 background mount.
- Chrome mobile and desktop: guarded static q4 background mount.
- Microsoft Edge and Bing in-app: UA profile detection plus guarded worker/cache/storage checks.
- WeChat and QQ in-app browsers: no crash if Worker, CacheStorage, or localStorage are unavailable or blocked.

## Runtime Guards

- `probeBrowserCapabilities()` reports `browser_family`, `in_app_browser`, `webview_family`, worker/cache/storage capability, and `compatibility_blockers`.
- Worker creation goes through `createWorkerSafely()` for both runtime and isolated self-check workers.
- `localStorage` reads/writes/removes go through safe wrappers.
- Cache namespace clearing is best effort and does not throw through to the UI.
- Compatibility status renders before remote/static config loading completes, so slow networks do not leave Dashboard stuck at `not_checked`.

## Chat Contract

- Chat mode shows 鳄鱼 branding, Chat/Dashboard toggle, message card, input card, and one visible send button on mobile.
- Chat hides model parameters, answer source footers, and engineering build badges.
- No `?lightweight=1` path, no “进入轻量模式” button, and no user-facing fast-chat option.
- Chat input and Send remain disabled while q4 is mounting; the loading screen stays visible until q4 is ready or an explicit blocker is shown.
- Final q4 failure remains visible in Dashboard as a blocker.

## Matrix Evidence

`scripts/r28p0d_browser_compat_matrix.mjs` runs a local static server and headless browser matrix:

- `chrome_desktop_fast`
- `edge_desktop_fast`
- `safari_ios_3g`
- `bing_ios_3g`
- `wechat_ios_worker_blocked`
- `qq_android_cache_blocked`

Latest local report path: `artifacts/r28p0d/reports/browser_compat_matrix.json`.

## Non-Claims

- Not product admission.
- Not browser admission.
- Not release checkpoint admission.
- No training.
- No new model weights or q4 shards.
- No backend inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
