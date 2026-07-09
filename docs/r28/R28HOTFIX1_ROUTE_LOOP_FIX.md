# R28HOTFIX1 Route Loop Fix

R28HOTFIX1 fixes the HOTFIX0 redirect loop observed at:

`/another_brain_chat?v=r28hotfix0-runtime-ui-activation`

## Root Cause

HOTFIX0 combined three canonicalization layers:

- Vercel `trailingSlash=false`
- a custom Vercel redirect from `/another_brain_chat` to `/another_brain_chat/`
- client-side `location.replace()` from static entry pages to `/another_brain_chat/`

That could ping-pong between no-slash and slash paths on Vercel.

## Fix

R28HOTFIX1 removes client redirects and the custom Vercel redirect.

The static entries now directly render the same app shell:

- `/` -> `web/index.html`
- `/another_brain_chat` -> `web/another_brain_chat.html`
- `/another_brain_chat/` -> `web/another_brain_chat/index.html`

`scripts/r28hotfix1_sync_static_entries.mjs` copies the canonical chat shell to the root and no-slash entries during `npm run build:vercel`.

## Required Markers

All entry files contain:

- `R28HOTFIX1`
- `过程摘要`
- `static_q4_experimental`
- `exact_runtime_tokenizer`
- `检查本地模型路径`

No entry contains `location.replace`, `location.href`, `history.replaceState`, or a meta refresh redirect.
