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
- Build command: `npm run check:release`.
- Output directory: `web`.
- Install command: default or empty; there are no runtime dependencies.

The checked-in `vercel.json` mirrors this static setup.

## Preflight

Run:

```bash
npm run check
npm run check:knowledge-shards
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
