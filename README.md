# efishother

efishother is a static browser runtime for a 96M-parameter local Chinese answer
model. The current public package is R28M1: a q4 browser model bundle with an
exact runtime tokenizer, same-origin shard loading, local retrieval cards, and a
diagnostic Dashboard for q4 mount evidence.

The app is static-hosted. It does not use backend inference, Vercel Functions,
Edge inference, external LLM APIs, Doubao, or a hosted vector store.

## 96M Browser Model

The committed R28M1 model package is designed for local browser loading:

- training lineage: 96M-parameter project model
- runtime package: q4 static browser artifact
- shard count: 5
- q4 shard bytes: 48,267,968
- static envelope: under the 100 MB static target
- tokenizer: exact runtime tokenizer
- public runtime location: `web/another_brain/model_assets/r28m1/`

Training and corpus development used reviewed project-local materials and
public-source/public-library style material summarized by repository training
docs and manifests. Raw private materials, raw/clean/processed corpus dumps,
checkpoints, tokenizer training artifacts, private calibration data, and hidden
prompts are not distributed in this repository.

## Runtime Surface

- Chat: minimal customer-facing answer surface.
- Dashboard: q4 asset status, tokenizer status, retrieval evidence, q4 forward
  status, and fallback reasons.
- Retrieval: static same-origin knowledge and style cards.
- Fallback: deterministic local rule/retrieval behavior when q4 is unavailable
  or a q4 draft is rejected by quality gates.

The q4 package is an experimental public runtime artifact. It is not a product
model admission, browser admission, or release checkpoint admission.

## License

The repository source code is MIT licensed. See `LICENSE`.

The committed R28M1 q4 browser model package is also released under MIT as a
static model artifact package. See `MODEL_LICENSE.md` and `MODEL_CARD.md`.

This license grant covers committed source and committed public runtime model
assets only. It does not grant rights to uncommitted private files, raw source
materials, ignored artifacts, raw checkpoints, LoRA/adapters, tokenizer training
artifacts, private calibration data, or external third-party materials.

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
