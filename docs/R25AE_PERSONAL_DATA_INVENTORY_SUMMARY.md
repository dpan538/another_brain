# R25AE Personal Data Inventory Summary

R25AE is a repository-scoped inventory audit only. It does not train, does not expand corpus, does not scan outside the repo root, does not ingest root PDFs/DOCX, and does not parse `data/public_ingestion/` content.

Current product and formal training progress remain 0%. Phase_4 scaled training remains blocked. No weights are committed, and detailed inventory JSON stays ignored under `artifacts/training_os/personal_inventory/r25ae/`.

## Aggregate Counts

- Tracked training corpus files: 6; rows by file: training/llm_corpus/dev.jsonl=80, training/llm_corpus/heldout.jsonl=80, training/llm_corpus/r25l_dev.jsonl=400, training/llm_corpus/r25l_heldout.jsonl=400, training/llm_corpus/r25l_train.jsonl=1600, training/llm_corpus/train.jsonl=320.
- Tracked long-horizon files: 2; total bytes: 61038.
- Eval-only tracked files: 148; total bytes: 3220215.
- Knowledge-source tracked files: 41; total bytes: 40818625.
- Identity/style scaffold tracked files: 20; total bytes: 87728.
- Tracked docs: 168; total bytes: 1447303.
- Untracked root PDF/DOC/DOCX files: 13; total bytes: 1070687.
- data/public_ingestion files: 2920; total bytes: 800690026.
- Ignored artifact files: 756; total bytes: 972072569.
- Possible legacy scan footprint paths inside repo: 2928.

## Boundary Result

- Root personal documents are not parsed and are not training sources.
- `data/public_ingestion/` is metadata-only in R25AE and is not a training source.
- Detailed inventory artifacts are ignored and must not be staged.
- Future corpus expansion needs fresh approval; future training needs separate fresh approval.
