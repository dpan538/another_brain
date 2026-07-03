# R25AK Promote Unique Repo-Derived Candidates

R25AK promotes selected reviewed unique candidates from the R25AJ ignored artifact into tracked training corpus split files. The source material is already tracked repo text, so promoted rows may be public/tracked after validation.

R25AK does not train, does not run tokenizer dry-run, does not commit ignored artifacts, does not parse root PDF/DOCX files, does not parse `data/public_ingestion`, does not read `private_sources`, and does not use evals as source material.

## Outputs

- `training/llm_corpus/r25ak_repo_derived_train.jsonl`
- `training/llm_corpus/r25ak_repo_derived_dev.jsonl`
- `training/llm_corpus/r25ak_repo_derived_heldout.jsonl`
- Ignored report: `artifacts/training_os/corpus_expansion/r25ak/r25ak_promotion_report.json`
- Ignored coverage report: `artifacts/training_os/corpus_expansion/r25ak/r25ak_promoted_corpus_coverage.json`

The ignored R25AJ candidate rows remain uncommitted. Future tokenizer review and any future training both require separate fresh approvals.
