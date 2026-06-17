# Deployment

The first public deployment target is `efishother.com` on Vercel static hosting.

## Architecture

```text
Vercel static hosting
  -> web/index.html
  -> web/app.js
  -> web/dialog_rules.js
  -> web/knowledge_base.generated.js
  -> web/knowledge_shards/*.json
  -> web/tiny_router_model.generated.js
```

Vercel must not run model inference, generate private memory artifacts, or build
local memory packs. Training and artifact generation happen locally before
release.

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
npm run check:vercel-build
```

This validates release safety, distillation metadata, tiny router readiness,
persona behavior, context stress behavior, and the Node model gate.

## Public Artifact Rule

Only public runtime files under `web/` should be deployed. Do not deploy:

- `artifacts/**`
- `web/brain_pack.js`
- `web/models`
- `web/vendor`
- local checkpoints
- LoRA adapters
- drive inventories
- source materials
- `.env` or Vercel credentials
