# Current Training Structure

R26A creates this canonical current-training directory as an index, not as a move operation.

- `corpus_manifest.json` references active corpus files in `training/llm_corpus/`.
- `training_status.json` records that product/formal training remain at 0%, phase_4 is blocked, and any future training needs fresh approval.
- `source_policy.json` keeps root DOC/PDF files, `data/public_ingestion/`, `private_sources/`, ignored artifacts, and eval prompts out of training by default.

No corpus rows were generated, promoted, rewritten, or moved in R26A.
