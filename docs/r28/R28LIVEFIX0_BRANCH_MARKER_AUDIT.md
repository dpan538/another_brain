# R28LIVEFIX0 Branch Marker Audit

R28LIVEFIX0 adds a unique preview marker:

- `R28LIVEFIX0`
- `r28livefix0-live-q4-mount`
- build commit marker `build-env-pending` locally, replaced from `VERCEL_GIT_COMMIT_SHA` during Vercel build
- build timestamp `2026-07-09T00:00:00+08:00`

The marker is present in:

- `web/another_brain_chat/index.html`
- `web/index.html`
- `web/another_brain_chat.html`
- `web/another_brain/runtime_mode.json`
- `web/another_brain/asset_manifest.json`

Preview mismatch rule:

- If the live preview does not show `R28LIVEFIX0` and `r28livefix0-live-q4-mount`, it is not this branch.
- SHIP2 previews showing `R28HOTFIX4` or `r28ship0-unified-q4-mount` must be treated as branch mismatch evidence.
