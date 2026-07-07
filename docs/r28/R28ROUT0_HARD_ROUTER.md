# R28ROUT0 Hard Router

R28ROUT0 is a product-surface guard for the static tiny SLM path:

`input/state packet -> local retrieval -> browser static decoder draft -> hard router / verifier / finalizer / fallback -> answer`

The router reads evidence status, adapter context presence, runtime mode, decode status, generation flags, and model output quality. It does not train, download, export, or mutate model assets.

## Behavior

- Sufficient evidence and stable output keep the model draft path.
- Insufficient evidence returns a deterministic Chinese boundary surface.
- Conflicting evidence returns a conflict boundary instead of merging claims.
- Malicious evidence is treated as untrusted instruction text.
- Empty, token-id-only, repetitive, timeout, overlong, or low-quality output routes to model fallback.
- Product/admission questions route to an explicit non-product status surface when admission is false.

## Runtime Integration

- `src/browser_runtime/finalizer_adapter.ts` applies the route policy after verifier/generation guards.
- `src/browser_runtime/generation_loop.ts` returns `answer_route`, `route_policy`, `quality_flags`, and `non_claims`.
- `src/browser_runtime/runtime_worker.ts` marks worker output as draft-path only and deferred to the router.
- `web/another_brain_chat/browser_runtime.js` mirrors the policy for the static chat shell.
- `web/another_brain_chat/app.js` shows the selected route in the status panel and debug packet.
