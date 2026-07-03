# R25AE Legacy Disk Scan Audit

R25AE searched only inside the repository root for legacy scan/import footprints. It did not follow paths, did not scan the hard drive, did not read root PDF/DOCX content, did not parse `data/public_ingestion/`, and did not train or expand corpus.

## Aggregate Findings

- Possible scan/import footprint files inside repo: 3032.
- Status distribution: ??=2941, tracked=90, !!=1.
- Feed-reference counts: training_corpus=8, knowledge_sources=8, identity_pack=37, package_scripts=31.
- Imported-text signal count: 2.
- File-name/metadata-only signal count: 2984.
- Safe tracked examples: `DATA_CARD.md`, `README.md`, `data/culture_cards/r24_stage0_concept_closure.jsonl`, `data/culture_cards/r28_cleanup_alias_boundary_cards.jsonl`, `data/external_cards/culture_cards.external.jsonl`, `data/external_cards/relation_cards.external.jsonl`.

## Interpretation

The audit did not find evidence that early hard-drive scan attempts imported useful personal training material into `training/llm_corpus/`.

Root personal files are not currently ingested into the training corpus by R25AE. `data/public_ingestion/` is not currently ingested into the training corpus by R25AE. Future corpus expansion needs fresh approval and must use only reviewed project-authored rows; future training needs separate fresh approval. Phase_4 remains blocked.
