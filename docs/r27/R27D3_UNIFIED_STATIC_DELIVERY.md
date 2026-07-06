# R27D3 unified static delivery

R27D3 is the unified static delivery integration branch for the currently completed B/D/C/E work. It starts from `origin/r27d2-pr-preview-followup` and integrates the static/browser-only surfaces from:

- R27D2 deploy readiness, PR checklist, and build command fixes.
- R27C0 context adapter packet contract and local import bridge.
- R27B8 browser asset cache and shard loader resilience.
- R27E0 demo QA acceptance harness.
- The B5 static delivery path retained by D1/D2.

## Runtime shape

The product path remains:

`input/state packet -> local retrieval -> browser static decoder draft -> verifier/finalizer/fallback -> answer`

R27D3 does not add backend inference, Vercel Function or Edge inference, external LLM APIs, Doubao, hosted vector storage, model downloads, product model admission, or training.

## Frontend surface

The static chat shell now exposes:

- Local-only badge.
- Model mode.
- RAG mode.
- Asset cache status.
- Asset progress.
- Asset verification state.
- Offline/cache fallback state.
- Adapter status: local session only, not saved, not training data.
- Budget status.
- Non-product warning.
- Fallback status.
- Evidence drawer.
- Context adapter import/export panel.
- Mobile layout hardening.

## Local verification

Run:

```sh
npm run test:r27d3
python3 scripts/r27d3_integration_audit.py
```

The audit verifies:

- D2 build config remains present.
- C0 adapter bridge is present.
- B8 asset cache is present.
- E0 acceptance harness is present.
- B5 static delivery path remains present.
- No model assets, tokenizer artifacts, ignored artifacts, root DOCX/PDF files, or `data/public_ingestion` payloads are tracked.
- No training is attached to `npm run build` or `npm run build:vercel`.
- No backend/external/Doubao/vector-store runtime is attached.
- Bundle is under 100MB.
- Static routes are available for `/`, `/another_brain_chat/`, and `/another_brain_chat/browser_runtime.js`.
- Adapter import/export, asset cache, static RAG, and acceptance smoke checks pass.

## Preview recommendation

Open a PR from `r27d3-unified-static-delivery` to `main` and prefer it over separate D2/C0/B8/E0 PRs. If Vercel preview fails, use the D2 log capture template before assigning root cause.
