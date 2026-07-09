# efishother

`efishother.com` is a local-first browser answer interface. The old repository
name, `another_brain`, is an engineering codename; the public surface is a small
chat page for "another efish", or another Crocodile.

The app is static-hosted and runs in the browser. It does not use backend
inference, Vercel Functions, Edge inference, external LLM APIs, Doubao, or a
hosted vector store.

## Current Runtime

- UI: one-page Chat surface plus a diagnostic Dashboard.
- Retrieval: static same-origin knowledge cards.
- Model assets: R28M1 static q4 browser assets under
  `web/another_brain/model_assets/r28m1/`.
- Tokenizer: exact runtime tokenizer under
  `web/another_brain/model_assets/r28m1/tokenizer/`.
- Runtime mode: `static_q4_experimental` when q4 shards, tokenizer, and q4
  forward smoke all pass.
- Fallback: deterministic local rule/retrieval fallback when q4 is unavailable
  or its draft is rejected by quality gates.

The checked-in q4 model assets are an engineering candidate. They are useful for
static browser runtime development, but they are not a product model admission,
browser admission, or release checkpoint admission.

## Model Summary

The committed R28M1 model package contains a compact q4 static artifact designed
for same-origin browser loading:

- shard count: 5
- q4 shard bytes: 48,267,968
- static bundle envelope: under the 100 MB static target
- source lineage: project training and conversion records summarized in the
  model manifests
- public runtime location: `web/another_brain/model_assets/r28m1/`

Training and corpus development used reviewed project-local and public-source
material as summarized by the repository training docs and manifests. Raw
private material, raw/clean/processed corpus artifacts, checkpoints, tokenizer
training artifacts, and unreviewed training outputs are not distributed in this
repository.

## License

The repository source code is MIT licensed. See `LICENSE`.

The committed R28M1 q4 browser model package is also released under MIT as a
static model artifact package. See `MODEL_LICENSE.md` and `MODEL_CARD.md`.

This license grant covers committed source and committed public runtime model
assets only. It does not grant rights to any uncommitted private files, raw
source materials, ignored artifacts, raw checkpoints, LoRA/adapters, tokenizer
training artifacts, private calibration data, or external third-party materials.

## Development

```bash
npm run test:r28livefix0
npm run build
npm run build:vercel
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
npm run check:training-approval-markers
npm run check:no-eval-hardcoding
```

## Non-Claims

- not a product model admission
- not a browser admission
- not a release checkpoint admission
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
- no new training in routine release gates
- no private raw data shipped in the public runtime
