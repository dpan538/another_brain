# R25B Static Decoder Admission

R25B prepares admission infrastructure for a future same-origin static browser
decoder LLM. It does not admit, train, download, convert, or commit real model
weights.

## Target

- Primary product target: static same-origin browser decoder LLM.
- Primary static profile: `pro_static_llm_full`.
- Optional constrained profile: `hobby_static_llm_lite`.
- Runtime host: Vercel static files only.
- Local storage: browser cache/storage only.
- Forbidden: backend inference, Vercel Function inference, Edge Function
  inference, external model APIs, Blob, KV, Postgres, Redis, AI Gateway,
  forbidden hosted vector stores, and forbidden third-party model hosting.

Encoder-only models and 100M-200M SLMs are not the final product target. They
can remain as fallback, comparison, or guardrail surfaces, but the answer path
must be designed around a decoder LLM draft wrapped by the R24 verifier,
finalizer, and fallback firewall.

## Expected Asset Layout

Production candidates should use:

```text
static_llm/manifests/<model-id>.json
static_llm/assets/<model-id>/config.json
static_llm/assets/<model-id>/tokenizer.json
static_llm/assets/<model-id>/model-00001.<reviewed-format>
```

Shard policy:

- target shard file size: `<= 32 MB`
- hard max shard file size: `<= 64 MB`
- all files listed in the manifest with exact bytes and sha256
- total bytes within the chosen static profile

## Manifest Requirements

A production manifest must include reviewed:

- model id, family, architecture, parameter count, tokenizer, quantization, and
  context length
- license and license URL
- source provenance and conversion provenance
- real sha256 hashes for every file
- `same_origin_only: true`
- `external_urls_allowed: false`
- `backend_required: false`
- `contains_private_data: false`

Example and fixture manifests must fail production admission.

## Browser Loading Plan

The browser loader may fetch same-origin static assets and use browser-local
cache. It must not call a backend, remote model API, or external storage
product. If no admitted manifest exists, the runtime reports disabled status
instead of generating a draft.

## Admission Criteria

Before real weights can be committed in R25C or later:

- local artifact conversion is reviewed
- license/provenance is reviewed
- manifest validates in admitted mode
- static budget checks pass
- no-backend/no-storage checks pass
- asset loader and browser budget evals pass with real assets
- R24 recovery, shard, Vercel, anti-lobotomy, and dialogue gates remain green

R25B only adds the corpus, fixture, and admission scaffolding needed for that
future decision.
