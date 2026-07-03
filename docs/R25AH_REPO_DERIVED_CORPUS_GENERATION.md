# R25AH Repo-Derived Corpus Candidate Generation

R25AH generates unreviewed candidate rows from selected existing tracked repository text. It is not training, not corpus promotion, and not a modification of `training/llm_corpus`.

The generation path is deliberately narrow:

- Select tracked project docs and safe scaffolds only.
- Exclude `evals/**`, root PDF, DOC, or DOCX files, `data/public_ingestion/**`, `private_sources/**`, and ignored artifacts as training content.
- Use deterministic local templates only.
- Keep detailed generated rows under ignored artifacts.
- Keep tracked summaries aggregate-only.
- Mark every generated row as `candidate_unreviewed`, `training_allowed:false`, and `public_commit_allowed:false`.

R25AH can improve the pool of reviewable Chinese-first personal examples, but it does not prove the examples are ready for training. R25AI is required to review and promote selected rows, and any future training after promotion needs another fresh approval. Phase_4 scaled training remains blocked.

## R25AJ Follow-Up

R25AI later blocked before promotion because the R25AH targets collapsed to too few unique answers. R25AJ preserves that diagnosis and regenerates a repaired ignored candidate pool with source-specific targets. R25AJ does not train, does not promote rows, and does not modify `training/llm_corpus`; R25AK is required before any reviewed subset can be promoted.
