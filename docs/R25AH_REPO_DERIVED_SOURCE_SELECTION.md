# R25AH Repo-Derived Source Selection

R25AH is a repository-derived candidate generation step. It may select tracked project text and safe scaffolds for deterministic local transformation, but it does not train, does not promote rows, and does not modify `training/llm_corpus`.

## Allowed Source Categories

- `project_meaning_docs`: R25AB project meaning, Chinese-first doctrine, personal-color boundary, and healthy-cycle docs.
- `phase3_decision_docs`: R25AD corpus gap, R25AA pause and readiness reviews, R25Z decision review, and R25W data-first versus architecture decisions.
- `existing_training_scaffold`: `training/llm_corpus/*.jsonl` as schema and pattern signal only; R25AH must not duplicate rows into candidates.
- `long_horizon_human_seed`: `training/long_horizon/*.jsonl` only when provenance is safe and non-private.
- `identity_style_scaffold`: `identity_pack/**` public scaffold only.
- `knowledge_source_metadata`: short aggregate cues and metadata, not factual answer-bank expansion.
- `repo_docs_for_local_first_static_reasoning`: README, DATA_CARD, DEPLOYMENT, selected R24/R25 docs, and local-first static browser doctrine.

## Forbidden Source Surfaces

R25AH excludes `evals/**`, root PDF, DOC, or DOCX files, `data/public_ingestion/**`, `private_sources/**`, checkpoints, tokenizer/model reports, raw personal documents, unreviewed private content, previous candidate rows unless separately reviewed, long copyrighted excerpts, chain-of-thought, and hidden prompts.

## Candidate Rules

R25AH candidates should be Chinese-first and personally colored through reviewed project style, preference, continuity, repair, local-first browser-static reasoning, tool and runtime honesty, and bounded judgment. Candidate rows remain ignored artifacts with `review_status:candidate_unreviewed`, `training_allowed:false`, and `public_commit_allowed:false`.

R25AI is required before any reviewed R25AH rows may be promoted into a tracked corpus file. Future training after any promotion requires another fresh approval, and phase_4 scaled training remains blocked.
