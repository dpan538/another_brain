# R24F Knowledge Build-Source Migration

R24F moves the monolithic generated knowledge build source out of deployable
`web/` while keeping shard-first runtime, Vercel static deployment, and the R24
recovery gates intact.

This is not a training patch. It does not add model weights, factual knowledge
cards, external LLM calls, or chain-of-thought data.

## Paths

- Old path: `web/knowledge_base.generated.js`
- New build-source path: `build_sources/knowledge/knowledge_base.generated.js`
- Public runtime path: `web/knowledge_runtime.js`
- Public shard output: `web/knowledge_shards/manifest.json`, `routing.json`, and `shard_XXX.json`

`artifacts/knowledge/` was not used for the source because ignored artifacts are
not a safe required input for clean checkout builds. The new `build_sources/`
path is non-public but still part of the reviewed release file set. R24G adds
`knowledge_sources/registry.json` and reviewed JSONL chunks as the source of
truth that generates this build source.

## Build Flow

`npm run build:knowledge` now does two steps:

1. `scripts/build_knowledge_base.py` writes the generated JS build source to
   `build_sources/knowledge/knowledge_base.generated.js` from
   `knowledge_sources/registry.json`.
2. `scripts/build_knowledge_shards.py` reads that source and regenerates
   `web/knowledge_shards/manifest.json`, `routing.json`, and shard files.

The shard manifest and routing index now record
`build_sources/knowledge/knowledge_base.generated.js` as their source path, with
`knowledge_sources/registry.json` recorded as the source-of-truth metadata.

## Guardrails

R24F adds:

```bash
npm run check:clean-knowledge-build
npm run check:r24f-build-source-migration
```

The clean checkout check verifies that the new source exists in the release file
set, the old `web/` source is absent, temp shard generation works from the new
path, manifest/routing metadata is current, and public runtime JS does not
import the monolith.

Vercel/static checks now fail if `web/knowledge_base.generated.js` appears in
deployable `web/`.

## Validation

Run:

```bash
npm run check:clean-knowledge-build
npm run audit:knowledge-build-source
npm run build:knowledge
npm run check:knowledge-shards
npm run check:knowledge-runtime
npm run eval:shard-runtime
npm run check:r24b-shard-runtime
npm run check:vercel-build
npm run check:r24-recovery-candidate
npm run check:r24f-build-source-migration
```

Expected state:

- public runtime remains shard-first
- Vercel deployable `web/` does not include the monolith
- shard smoke still lazy-loads selected shards only
- training remains disabled by default
- recovery candidate gate remains green

## Rollback Plan

If a clean checkout build fails, keep the source outside `web/` and fix the
script default or package command that still points at the old path. Do not
restore a public runtime import of the monolith. If emergency rollback is
needed, restore the previous file location only with Vercel/static checks still
forbidding deployable runtime imports.

## R24G Status

R24G derives the generated build source from `knowledge_sources/` without adding
facts or changing runtime behavior. The generated build source remains in the
release file set for R24G review, but it is no longer the source of truth. R24H
can decide whether to make that generated file generated-only after the source
roundtrip, clean checkout, shard runtime, Vercel, and recovery candidate gates
remain green.
