# efishother

efishother is a static browser runtime for **efishv1**, a 96M-parameter local
Chinese answer model trained for short, boundary-aware, retrieval-assisted
answers in the browser. The current public package is the R28M1 q4 bundle:
same-origin model shards, an exact runtime tokenizer, local retrieval cards, and
a diagnostic Dashboard for q4 mount evidence.

The app is static-hosted. It does not use backend inference, Vercel Functions,
Edge inference, external LLM APIs, or a hosted vector store.

## efishv1 96M Browser Model

efishv1 is the project’s core model artifact: a compact self-developed 96M
runtime model packaged for browser-side loading rather than cloud inference. The
committed R28M1 package is its current public q4 runtime form:

- training lineage: 96M-parameter project model
- runtime package: q4 static browser artifact
- shard count: 5
- q4 shard bytes: 48,267,968
- static envelope: under the 100 MB static target
- tokenizer: exact runtime tokenizer
- public runtime location: `web/another_brain/model_assets/r28m1/`

Training and corpus development used reviewed project-local material plus
public-source/public-library style material summarized by repository training
docs and manifests. The public repository distributes the committed runtime
artifact and documentation only: raw private materials, raw/clean/processed
corpus dumps, checkpoints, tokenizer training artifacts, private calibration
data, and hidden prompts are not distributed.

## Runtime Surface

- Chat: minimal customer-facing answer surface.
- Dashboard: q4 asset status, tokenizer status, retrieval evidence, q4 forward
  status, and fallback reasons.
- Retrieval: static same-origin knowledge and style cards.
- Fallback: deterministic local rule/retrieval behavior when q4 is unavailable
  or a q4 draft is rejected by quality gates.

The q4 package is the public efishv1 runtime artifact for this static demo. Its
Dashboard remains intentionally explicit about mount status, q4 forward status,
and fallback reasons.

## License

The repository source code is MIT licensed. See `LICENSE`.

The committed R28M1 q4 browser model package, published here as efishv1, is also
released under MIT as a static model artifact package. See `MODEL_LICENSE.md`
and `MODEL_CARD.md`.

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

## Public Runtime Boundaries

- static browser runtime; no backend inference path
- no external LLM API or hosted vector store in the public runtime
- committed q4 model package only; no raw checkpoints or training artifacts
- no private raw data shipped in the public runtime
- routine release gates do not run training
