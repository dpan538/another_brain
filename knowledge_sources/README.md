# Knowledge Sources

`knowledge_sources/` is the reviewed source-of-truth layer for the generated
browser knowledge build source.

R24G created these files by mechanically extracting the R24F generated build
source. No new facts were added, no answer text was rewritten, and no external
LLM or training process was used.

## Files

- `registry.json`: deterministic registry of source chunks and shared provenance.
- `schema.json`: JSON Schema for source rows.
- `cards/cards_XXX.jsonl`: reviewable card chunks in original generated order.
- `cards/domains_manifest.json`: domain counts for review navigation.

## Row Shape

Each JSONL row stores observable card data only:

- `source_id`
- `order`
- `domain`
- `label`
- `aliases`
- `answers`
- `source_type`
- `provenance`
- `review_status`
- `contains_private_data`
- `license_or_permission`
- `notes`

Rows must not contain chain-of-thought, hidden prompts, raw private data, local
paths, API keys, model weights, or unreviewed personal data.

## Build Flow

`npm run build:knowledge` reads `registry.json` and the listed chunks to produce
`build_sources/knowledge/knowledge_base.generated.js`, then builds
`web/knowledge_shards/manifest.json`, `routing.json`, and shard files.

The generated build source remains outside deployable `web/`. The public runtime
continues to use shard-first lazy loading.

## Review Rules

- Preserve deterministic `order`.
- Do not add factual rows as part of recovery work.
- Do not store chain-of-thought or hidden prompts.
- Mark synthetic rows explicitly before any future use; R24G adds none.
- Keep provenance and review status on every row or chunk.
