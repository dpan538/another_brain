# R25AM Second Chinese-Personal Corpus Expansion

R25AM expands the tracked corpus because R25AL showed the post-R25AK corpus still needed more Chinese-personal rows. The project remains a Chinese-first, personally colored, project-trained browser decoder effort, not a GPT clone and not a project reset.

R25AM generates deterministic repo-derived candidates under ignored artifacts, validates uniqueness and safety, then promotes a bounded subset into new tracked split files:

- `training/llm_corpus/r25am_repo_derived_train.jsonl`
- `training/llm_corpus/r25am_repo_derived_dev.jsonl`
- `training/llm_corpus/r25am_repo_derived_heldout.jsonl`

R25AM does not train, does not run tokenizer dry-run, does not read `private_sources/`, does not parse root PDFs/DOCX, does not parse `data/public_ingestion/`, does not use evals as sources, and does not commit ignored artifacts or weights.

The promoted rows are public/tracked only because their source material is already repo-tracked and reviewed as safe project material. R25AN is required before any tokenizer readiness review over the R25AM-expanded corpus. Decoder training still requires a later, separate approval.
