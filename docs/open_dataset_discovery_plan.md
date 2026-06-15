# Open Dataset Discovery Plan

R16 source discovery is a license-first registry process. It is not a raw-corpus import.

## Goals

- Discover public/open sources that can strengthen culture, metadata, reasoning, and verifier training.
- Record license proof, allowed uses, attribution/share-alike obligations, and rejection reasons.
- Prefer metadata graphs and structured benchmarks over raw prose.
- Keep large corpora, raw text dumps, lyrics, private files, and source snippets out of the repo.

## Admission Rules

An admitted source must have:

- verified license confidence;
- a stable license URL;
- explicit allowed uses;
- no NC or ND restriction for public training/runtime;
- no lyrics or dense copyrighted text requirement;
- low privacy risk;
- a sample cap;
- importer status `planned` or `implemented`.

ShareAlike and attribution-heavy sources remain candidates until downstream obligations are documented. Unknown license sources are rejected or kept as candidate only.

## Registry Outputs

```text
data/external_sources/open_dataset_registry.jsonl
data/external_sources/admitted_open_sources.jsonl
data/external_sources/rejected_open_sources.jsonl
```

## Discovery Categories

- Large open text corpora: Common Pile, Common Corpus, Dolma/OLMo, Hugging Face datasets, MLCommons/Croissant.
- Knowledge and metadata graphs: Wikidata, OpenAlex, Open Library, Library of Congress, VIAF, DBpedia.
- Music metadata: MusicBrainz, ListenBrainz, Wikidata music entities.
- Literature: Wikidata, Open Library, Project Gutenberg metadata, Aozora Bunko, national library metadata.
- Art/museum/design: The Met, Art Institute of Chicago, Rijksmuseum, Europeana, Smithsonian, Wikimedia Commons metadata, Getty vocabularies.
- Reasoning/math/symbolic: ARC, OpenBookQA, GSM8K, OpenMathInstruct, BIG-Bench/BBH, bAbI, StrategyQA, Math23K.

## Current R16 Policy

Admitted sources may be used only through capped metadata or benchmark importers. No admitted source automatically enters public runtime. Generated candidates default to `needs_review: true` and `approved_for_public_runtime: false`.

The registry may describe sources with URLs and license summaries, but must not commit raw dumps, book text, lyrics, web-scraped passages, contact details, or local paths.
