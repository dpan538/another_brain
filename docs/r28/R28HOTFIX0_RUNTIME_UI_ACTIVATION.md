# R28HOTFIX0 Runtime UI Activation

R28HOTFIX0 is a production hotfix for the R28UX4 static preview UI/runtime activation path.

## Scope

- Branch: `r28hotfix0-runtime-ui-activation`
- Base: `origin/main`
- No training.
- No new model assets.
- No backend inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
- No product, browser, or release checkpoint admission.

## Fix Summary

The observed production failure was a route/DOM/runtime activation issue, not a model training issue.

- `/another_brain_chat?message=...` without a trailing slash could load root-relative legacy assets.
- The legacy root `app.js` tried to bind events to missing chat DOM nodes and threw `Cannot read properties of null (reading 'addEventListener')`.
- The chat UI showed R28UX4 text but did not reliably activate the static q4 runtime path.

R28HOTFIX0 fixes this by:

- Canonicalizing `/another_brain_chat` to `/another_brain_chat/` while preserving query params.
- Loading chat CSS/JS from absolute `/another_brain_chat/...` URLs with the `r28hotfix0-runtime-ui-activation` cache-busting version.
- Adding null-safe DOM event binding in both chat and legacy root scripts.
- Loading the same-origin static q4 runtime worker with a cache-busted URL.
- Running model path self-check on boot and on the visible self-check button.
- Showing q4/runtime/tokenizer/fallback status in the public process panel.

## Runtime Behavior

When committed q4 assets, tokenizer, and a q4 forward smoke are available:

- `runtime_mode=static_q4_experimental`
- `tokenizer_status=exact_runtime_tokenizer`
- `q4_forward_ran=true`
- `tokens_generated>0`
- `answer_source` is updated by the generation/finalizer path.

When q4 runtime is unavailable:

- `runtime_mode=synthetic_fallback`
- The blocker is shown in the UI.
- The page does not claim a model-draft answer.

## Verification

R28HOTFIX0 adds:

- `scripts/r28hotfix0_route_runtime_audit.py`
- `tests/r28hotfix0/`
- `npm run test:r28hotfix0`

Local verification includes route canonicalization, no-null event binding, visible model path self-check, q4 default activation when assets are available, and send-path process trace updates.
