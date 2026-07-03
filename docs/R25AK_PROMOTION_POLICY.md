# R25AK Promotion Policy

R25AK promotes a bounded reviewed subset of R25AJ unique repo-derived candidates into tracked corpus split files. It does not train, does not run tokenizer dry-run, does not approve phase_4, and does not commit ignored artifacts.

## Scope

- Source: `artifacts/training_os/corpus_expansion/r25aj/r25aj_repo_derived_candidate_rows.jsonl`
- Targets:
  - `training/llm_corpus/r25ak_repo_derived_train.jsonl`
  - `training/llm_corpus/r25ak_repo_derived_dev.jsonl`
  - `training/llm_corpus/r25ak_repo_derived_heldout.jsonl`
- Maximum promoted rows: 320
- Required split: train 256, dev 32, heldout 32

## Review Rules

Rows must pass hard-fail checks from the R25AJ rubric, keep normalized `target_answer` values unique, and preserve Chinese-first distribution. Numeric rubric scores are not required for this machine promotion pass; if scores are absent, validator hard checks plus diversity coverage are mandatory.

Rows are rejected if they use evals, root documents, `data/public_ingestion`, `private_sources`, artifact checkpoints, hidden prompts, chain-of-thought, local absolute paths, secret-like strings, private raw data, empty targets, duplicate targets, or trivial suffix-only uniqueness.

## Promotion Transform

Selected rows are changed from unreviewed candidates into reviewed corpus rows by setting:

- `review_status: reviewed_for_training_corpus`
- `training_allowed: true`
- `public_commit_allowed: true`
- `contains_private_data: false`
- `provenance.promoted_by: scripts/promote_r25ak_unique_candidates.mjs`
- `provenance.promotion_phase: R25AK`
- `provenance.external_llm_used: false`

These flags only mark the rows as allowed in the tracked corpus. They do not approve model training or tokenizer dry-run.
