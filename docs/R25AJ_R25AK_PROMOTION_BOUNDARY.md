# R25AJ to R25AK Promotion Boundary

R25AJ produces ignored, unreviewed candidate rows only. R25AK is the next possible promotion step, and it is intentionally inert until a fresh reviewer approval exists.

## R25AJ Output State

- Candidate rows live under `artifacts/training_os/corpus_expansion/r25aj/`.
- Rows remain `candidate_unreviewed`.
- Rows remain `training_allowed:false`.
- Rows remain `public_commit_allowed:false`.
- No row is in `training/llm_corpus`.
- No training, tokenizer dry run, phase_4 run, or product-stage action is approved.

## R25AK Requirements

A future R25AK task may promote a bounded reviewed subset only if it has a fresh explicit approval marker. That future step must:

- select reviewed rows from the ignored R25AJ artifact
- preserve split separation
- keep Chinese-first distribution
- reject duplicate normalized target answers
- reject eval, root document, `data/public_ingestion`, `private_sources`, and artifact checkpoint sources
- keep phase_4 blocked
- still not train

The R25AK template at `training/from_scratch/APPROVE_R25AK_PROMOTE_UNIQUE_REPO_DERIVED_CANDIDATES.template.json` has `approved:false` and does not authorize promotion or training.

## R25AK Outcome Boundary

R25AK adds reviewed repo-derived corpus split files, not a trained model. The
next boundary is R25AL post-promotion corpus review; tokenizer readiness and
model training remain separate future approvals.
