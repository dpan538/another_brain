# Deployment

The first public deployment target is `efishother.com` on Vercel static hosting.

## Architecture

```text
Vercel static hosting
  -> web/index.html
  -> web/app.js
  -> web/dialog_rules.js
  -> web/knowledge_runtime.js
  -> web/knowledge_shards/manifest.json
  -> web/knowledge_shards/routing.json
  -> selected web/knowledge_shards/shard_XXX.json files
  -> legacy fallback/runtime guardrails
  -> future same-origin /static_llm/assets/... files after admission
```

Vercel must not run model inference, generate private memory artifacts, build
local memory packs, call external model APIs, or use Functions/Edge Functions
for LLM inference. It must not rely on Blob, KV, Postgres, Redis, AI Gateway, a
hosted vector store, or any third-party storage product for model loading.
Training and artifact generation happen locally before release. R25I clarifies
that the main model artifact should come from a future from-scratch project
training pipeline, not from LoRA, adapters, fine-tuning, or selecting an
existing pretrained model as the final product.

R25 targets a same-origin static decoder LLM that loads in the browser. R25A
and R25B do not add weights. R25C adds local artifact intake and dry-run
admission only. R25D adds browser backend/worker binding and fixture
first-token smoke tests only. R25E attempts local artifact admission from
approved inbox paths and remains blocked when no reviewed artifact is present.
R25F removes the prior named candidate from the active repo surface and resets
selection to a model-agnostic reviewed-decoder placeholder.
R25G adds candidate decision records, conversion path review, and a request
pack before artifact admission; those records do not admit weights. R25I adds
release decisions for future self-trained artifacts and makes that the product
path. External pretrained artifacts are baseline/compatibility only.
R25J adds tokenizer dry-run and toy decoder pipeline scaffolding. These are
local training-preparation checks only: generated tokenizer reports stay under
ignored `artifacts/`, and the toy overfit command skips by default.
R25K may run a toy-only sanity check after approval, and R25L may expand corpus
rows and plan a small decoder pilot. The pilot runner skips by default, no
formal decoder training starts, and no pilot checkpoint or tokenizer artifact
is deployed.

A future real model can be served only as static files under the approved
static LLM asset path, with explicit release-scoped approval, a reviewed
manifest, real sha256 hashes, license/provenance review, backend-format review,
first-token gate, and a static budget pass.

The public knowledge shards are derived locally from the reviewed source layer
under `knowledge_sources/`. `scripts/build_knowledge_base.py` generates
`build_sources/knowledge/knowledge_base.generated.js` from that source layer,
then `scripts/build_knowledge_shards.py` generates the deployable shard files.

## Vercel Settings

- Framework preset: Other.
- Build command: `npm run build:vercel`.
- Output directory: `web`.
- Install command: default or empty; there are no runtime dependencies.

The checked-in `vercel.json` mirrors this static setup.

`build:vercel` is intentionally not the full release gate. It prepares the
static runtime version for the Vercel deployment, verifies that `web/` is safe
to publish, and then exits. The full endpoint/training/release gates run
locally before pushing to `main`.

Vercel builds must not run long-running training, browser automation, WebGPU
benchmarks, or generated-data loops. A remote deployment should answer one
question only: "is the already checked-in static public runtime safe to serve?"

## Runtime Version And Cache

During a Vercel build, `scripts/prepare_vercel_static_build.mjs` writes the
current `VERCEL_GIT_COMMIT_SHA` into `web/runtime_version.js` and rewrites the
top-level `app.js?v=` cache-busting token to the commit short SHA.

JavaScript files are served with `Cache-Control: public, max-age=0,
must-revalidate`. This avoids the stale-module problem where a successful push
can still show an older browser-side runtime because a fixed module URL was
cached as immutable.

## Preflight

Run:

```bash
npm run check
npm run check:knowledge-shards
npm run check:knowledge-runtime
npm run eval:shard-runtime
npm run check:vercel-build
npm run check:r25-llm-first-static
npm run check:r25b-static-decoder-training
npm run check:r25c-static-artifact-intake
npm run check:r25d-browser-inference-binding
npm run check:r25e-artifact-admission
npm run check:r25f-candidate-purge
npm run check:r25g-candidate-decision
npm run check:r25h-capacity-envelope
npm run check:r25i-from-scratch-roadmap
npm run check:r25j-tokenizer-toy-pipeline
npm run check:r25k-toy-overfit-sanity
npm run check:r25l-corpus-pilot-plan
npm run check:r25m-small-decoder-pilot
```

This validates release safety, legacy fallback readiness, persona behavior,
context stress behavior, static LLM admission scaffolding, R25B training-corpus
separation, and the Node model gate.

## Public Artifact Rule

Only public runtime files under `web/` should be deployed. Do not deploy:

- `artifacts/**`
- `web/brain_pack.js`
- `web/knowledge_base.generated.js`
- `web/models`
- `web/vendor`
- unadmitted `web/static_llm/assets/**`
- static LLM manifests with external asset URLs
- local checkpoints
- LoRA adapters
- drive inventories
- source materials outside the reviewed build-source set
- `.env` or Vercel credentials

Model weights are banned everywhere by default. They become deployable only
under the approved static LLM asset path and only when
`npm run check:static-llm-manifest`, `npm run check:static-llm-budget`, and
`npm run check:no-backend-llm` all pass.

R25B fixture files under `static_llm/fixtures/` are loader smoke-test assets
only. They are not production weights and must not be admitted. R25C inbox files
under `static_llm/inbox/` and `static_llm/models_staging/` are local-only and
ignored by default. Real static decoder artifacts can be committed only after
reviewed license/provenance, real hashes, browser-budget checks, explicit user
approval, and the full R24/R25 gate suite.

R25E production approval must be expressed inside the candidate directory with
`APPROVE_STATIC_LLM_PRODUCTION_ADMISSION.json`. `scope: "commit_assets"` is
required before model-like files can be staged for git.

R25F additionally requires the removed-candidate purge guard to pass before a
static decoder artifact can become the active product target.

R25H capacity dry-run manifests under `static_llm/manifests/dryrun/` are
non-production. They test static profile fit, shard count, browser memory/cache
risk, and deploy payload simulation, but cannot be admitted or deployed as real
model assets.

R25I release decisions under `static_llm/release_decisions/` are planning
records for future self-trained artifacts. They do not admit weights, do not
mean training has started, and do not bypass R25E/R25H gates.

R25J tokenizer dry-run artifacts and toy decoder reports live under ignored
`artifacts/training_os/` directories. They are local evidence for pipeline
readiness and must not be deployed as product assets or committed as weights.

R25L expanded tokenizer dry-run artifacts and small decoder pilot planning
reports also live under ignored `artifacts/training_os/` directories. They are
review material only: no backend, external storage, model API, remote download,
or deployed pilot weight is introduced.

R25M small decoder pilot artifacts live under ignored
`artifacts/training_os/small_decoder_pilot/r25m/`. They are local pilot reports
and checkpoint digests only, not release checkpoints or browser assets. They
must not be copied into `web/`, `static_llm/assets/`, `build_sources/`, or
`knowledge_sources/`, and they must not be staged or committed.

The monolithic generated knowledge build source lives at
`build_sources/knowledge/knowledge_base.generated.js`, outside `web/`, and is
generated from `knowledge_sources/registry.json` plus reviewed JSONL chunks. It
is used by `npm run build:knowledge` to regenerate `web/knowledge_shards/`, but
it must not be copied into deployable public runtime JavaScript. The public
knowledge runtime should use `web/knowledge_runtime.js`, `manifest.json`,
`routing.json`, and lazily selected shard JSON files.
