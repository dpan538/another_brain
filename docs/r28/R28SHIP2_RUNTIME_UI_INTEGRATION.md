# R28SHIP2 Runtime/UI Integration

Runtime truth:

- q4 assets are same-origin static assets under `web/another_brain/model_assets/r28m1`.
- exact tokenizer is `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`.
- q4 fetch paths use absolute same-origin normalization.
- self-check has quick and deep paths and is non-blocking from the UI.
- retry-before-fallback is preserved through `mountQ4WithRetry`.
- q4-ready answers expose `static_q4_experimental` telemetry.
- q4 failure exposes blocker and fallback reason.

UI truth:

- default mode is Chat.
- Dashboard is switchable.
- top header exposes `another_brain`, Chat/Dashboard, `local/static`, and `not product`.
- Chat keeps conversation, input, send/stop, and compact status.
- Dashboard exposes q4 asset status, tokenizer status, RAG evidence, trace, and release blockers.
- mobile loading has stage markers, animation assets, and cancel behavior.

Privacy/non-claim boundary:

- no hidden prompt display.
- no chain-of-thought display.
- no product model/admission claim.
- no backend or external inference.
- prompt-injection requests route to `malicious_evidence_boundary` before q4 generation.
- category-specific open-question surfaces do not cross-contaminate relation, language, and aesthetic answers with unrelated abstract fragments.

Verified behavior:

- simple intents stay on the router fast path.
- open questions attempt q4 when ready and fall back with visible reason when needed.
- q4-ready accepted drafts expose `router_after_model_draft` or model draft telemetry.
- q4 unavailable/timeout paths expose blockers instead of claiming `static_q4` while answering from `no_model_fallback`.
