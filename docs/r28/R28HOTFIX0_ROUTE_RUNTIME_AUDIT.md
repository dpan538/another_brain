# R28HOTFIX0 Route Runtime Audit

## Routes

The static preview supports these entry paths:

- `/`
- `/another_brain_chat`
- `/another_brain_chat/`
- `/another_brain_chat?message=...`
- `/another_brain_chat/?message=...`

## Behavior

- `/` redirects to `/another_brain_chat/?v=r28hotfix0-runtime-ui-activation` and preserves user query params.
- `/another_brain_chat` is redirected by `vercel.json` to `/another_brain_chat/`.
- `web/another_brain_chat.html` provides a static no-backend fallback canonicalizer for hosts that serve the no-slash path directly.
- `/another_brain_chat/` serves `web/another_brain_chat/index.html`.
- The chat route loads `/another_brain_chat/styles.css?v=r28hotfix0-runtime-ui-activation`.
- The chat route loads `/another_brain_chat/app.js?v=r28hotfix0-runtime-ui-activation`.

## Audit Checks

`scripts/r28hotfix0_route_runtime_audit.py` checks:

- Root static entry.
- No-slash chat route support.
- Slash chat route support.
- Query preserving canonicalization.
- Loaded JS/CSS paths.
- R28HOTFIX0 marker.
- Process panel marker.
- Model path self-check button.
- q4 worker runtime.
- Asset manifest version.
- Runtime mode version.
- q4 shard files and tokenizer file.
- git-tracked r28m1 static assets.

Latest local audit result:

- `ok=true`
- `q4_file_count=7`
- `shard_count=5`
- `tracked_r28m1_file_count=10`

The audit writes a local report under `artifacts/r28hotfix0/reports/`; that report is not tracked.
