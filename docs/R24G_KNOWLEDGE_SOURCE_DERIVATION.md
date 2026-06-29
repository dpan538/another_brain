# R24G Knowledge Source Derivation

R24G makes the knowledge source reviewable without changing runtime behavior.
The public app still uses shard-first lazy loading, and the generated monolith
still stays outside deployable `web/`.

This is not a training patch. It does not call external LLM APIs, add model
weights, add factual knowledge cards, or store chain-of-thought data.

Under R25, R24G is shard/routing infrastructure for a future LLM-first static
browser path. The shards provide local static retrieval evidence; they are not
the main intelligence layer and should not become a hand-authored answer bank
expansion strategy.

## Paths

- Source of truth: `knowledge_sources/registry.json`
- Reviewed source chunks: `knowledge_sources/cards/cards_XXX.jsonl`
- Source schema: `knowledge_sources/schema.json`
- Generated build source: `build_sources/knowledge/knowledge_base.generated.js`
- Public runtime: `web/knowledge_runtime.js`
- Public shard output: `web/knowledge_shards/manifest.json`, `routing.json`, and `shard_XXX.json`

`knowledge_sources/` was mechanically extracted from the R24F build source. Each
row preserves the existing card domain, label, aliases, answers, and order. The
new metadata records provenance, review status, license/permission, and private
data flags. No answer text was rewritten and no new facts were added.

## Build Flow

`npm run build:knowledge` now derives the generated build source from
`knowledge_sources/registry.json`, then regenerates public shards:

```bash
python3 scripts/build_knowledge_base.py
python3 scripts/build_knowledge_shards.py
```

The generated build source keeps the JS export shape expected by the shard
builder. The shard manifest and routing index still record
`build_sources/knowledge/knowledge_base.generated.js` as the immediate source,
and also include `source_of_truth` metadata pointing to
`knowledge_sources/registry.json`.

## Validation

R24G adds:

```bash
npm run audit:knowledge-source-derivation
npm run extract:knowledge-sources
npm run check:knowledge-source-provenance
npm run check:knowledge-source-roundtrip
npm run report:knowledge-source-size
npm run check:r24g-source-derivation
```

The roundtrip check verifies that rows from `knowledge_sources/` match the
generated build source by card count, labels, aliases, answers, domains, and
stats. The provenance check rejects chain-of-thought fields, hidden prompts,
private raw data markers, local paths, secret-looking strings, and repo-local
model weight references.

## Reviewability

Current size report:

- Generated build source: 7,645,750 bytes.
- Knowledge source total: 40,818,625 bytes.
- Source chunks: 37 JSONL files.
- Largest source chunk: 1,149,757 bytes.
- Shards: 43 files, largest 179,996 bytes.
- Routing index: 1,400,960 bytes.

The reviewed source layer is larger in total because every row now carries
metadata, but each chunk is much smaller than the generated monolith and can be
reviewed independently.

## Tracking Policy

For R24G, `build_sources/knowledge/knowledge_base.generated.js` remains in the
release file set as a generated build output. It is no longer the source of
truth. Keeping it for one patch makes review and rollback simple while the
source-derived build path is validated.

R24H can consider making the generated build source generated-only after:

1. `check:r24g-source-derivation` remains green.
2. `check:clean-knowledge-build` proves clean checkout support from
   `knowledge_sources/`.
3. `check:r24-recovery-candidate` remains green.
4. Public runtime still does not import any monolithic knowledge source.

## Runtime Boundary

R24G does not change the browser answer path. The app still loads
`manifest.json`, `routing.json`, and selected shard JSON files only. It does not
fetch the generated build source and does not load all shards at startup.

Training remains disabled by default. Future bounded LLM training still requires
the recovery candidate gate, held-out gates, split integrity, no-hardcoding,
provenance validation, no chain-of-thought data, and reviewer approval.
R25 additionally requires same-origin static LLM assets, no backend inference,
no external model API, no external storage product for model loading, and a
manifest/budget/license/provenance admission pass before any real decoder model
is used.

## R25B Boundary

R25B does not expand factual knowledge cards. Its LLM corpus scaffold teaches
future draft behavior: how to use retrieved shard evidence, preserve user
constraints, and stay inside no-backend/no-storage deployment limits. Knowledge
source rows remain public evidence inputs, while training rows remain behavioral
examples with separate split and contamination validation.
