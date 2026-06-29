# R24B Shard-First Knowledge Runtime

R24B removes the browser runtime dependency on the monolithic generated knowledge module. It is an infrastructure recovery patch, not an LLM training patch.

R25 keeps this as retrieval and routing infrastructure for a future
same-origin static browser decoder LLM. Shards should provide local evidence to
the LLM draft path; they should not become the main intelligence layer or a
manual answer-bank expansion strategy.

## What Changed

- `npm run build:knowledge` now generates `web/knowledge_shards/routing.json` alongside `manifest.json` and `shard_XXX.json`.
- `web/knowledge_runtime.js` loads `manifest.json`, `routing.json`, and selected shard files with `fetch(..., { cache: "force-cache" })`.
- `web/app.js` warms knowledge for the current query before calling the existing synchronous conversation controller.
- `web/dialog_rules.js` reads generated cards from `cachedKnowledgeCards()` and rebuilds its alias index when loaded shards change.
- Node evals use a local file-backed knowledge runtime adapter so they exercise the same shard cache behavior without browser APIs.

## Why The Monolith Was A Risk

`web/knowledge_base.generated.js` is about 7.6 MB. Importing it from `dialog_rules.js` forced the browser module graph to depend on the full generated knowledge body even though shards already existed. That weakened the Vercel/static-hosting plan and made mobile startup heavier than necessary.

R24B kept the monolith only as a local build source for shard generation. R24F moved that build source to `build_sources/knowledge/knowledge_base.generated.js`, outside deployable `web/`. R24G then made `knowledge_sources/registry.json` plus JSONL chunks the source of truth that derives the generated build source. Vercel/static checks fail if the old `web/knowledge_base.generated.js` returns or if deployable public JS imports any monolithic generated knowledge module.

## Routing Index

`routing.json` contains compact lookup metadata:

- schema version and source sha
- source-of-truth metadata pointing to `knowledge_sources/registry.json`
- shard count
- shard file metadata, domains, first label, and last label
- normalized label and alias entries mapped to shard indexes

It does not contain `cards`, `answers`, or answer-body fields. The generated routing file is roughly 1.4 MB, much smaller than the monolithic knowledge module.

## Lazy Loading

The runtime does not fetch at module import time. On each query:

1. Load `routing.json` and `manifest.json` if not already cached.
2. Normalize the query.
3. Score routing label/alias matches first, with domain hints as weaker signals.
4. Fetch only the top matching shard files.
5. Cache loaded shard cards in memory.
6. Let the existing synchronous direct-answer path read from the cache.

The smoke eval currently answers `毛巾`, `白平衡`, and `GitHub` queries after loading 2 of 43 shards.

## Guardrails

Run:

```bash
npm run build:knowledge
npm run check:knowledge-shards
npm run check:knowledge-runtime
npm run eval:shard-runtime
npm run check:vercel-build
```

The checks enforce:

- routing and manifest JSON exist and parse
- manifest shard count matches actual shard files
- shard files stay under 180000 bytes
- routing entries point to valid shard indexes
- routing does not include answer-body fields
- public runtime JS does not import `knowledge_base.generated.js`
- Vercel deployable files do not include model weights or oversized JS/JSON assets

## What Is Not Solved

- The generated build source is now derived from `knowledge_sources/`, but remains in the release file set for R24G review. R24H can decide whether to make it generated-only.
- R24B does not train, distill, optimize, or call an external LLM.
- R24B does not fix the R24A intelligence-recovery and long-horizon baseline failures. Those remain regression evidence until behavior improves without hardcoded eval answers.
- The future LLM path remains bounded short-draft generation after deterministic routing, retrieval, verifier, and fallback firewall checks.
- Under R25, that future LLM path is specifically a same-origin static browser
  decoder model admitted by manifest, budget, license/provenance, and
  no-backend checks.
