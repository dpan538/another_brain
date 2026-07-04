# R26A Project Structure Policy

R26A pauses training and standardizes the repository structure. It is non-destructive: it may audit, classify, document, and create manifests, but it must not delete files, move files, train, run tokenizer dry-run, expand corpus, promote rows, parse private/local documents, or commit artifacts.

## Top-Level Categories

1. `active_runtime`: `web/`, `knowledge_sources/`, `build_sources/`, and `static_llm/` scaffolds.
2. `active_training_current`: `training/llm_corpus/`, `training/long_horizon/`, `training/from_scratch/` current configs/templates, and `training/current/` indexes.
3. `active_eval_current`: current recovery and generalization gates under `evals/`.
4. `active_scripts`: current build, check, eval, report, and manifest scripts under `scripts/`.
5. `active_docs_current`: README, DATA_CARD, DEPLOYMENT, R26 docs, and active project target/training/data strategy docs.
6. `historical_docs`: R24/R25 milestone docs that are useful history but not current operating instructions.
7. `historical_training_pilots`: tracked configs/docs for R25M/P/S/V/Y/AC/AO/AR pilot history; ignored reports and checkpoints remain artifacts.
8. `generated_ignored_artifacts`: `artifacts/**`, never committed by R26A.
9. `private_or_local_sources`: `private_sources/**`, root DOC/PDF files, and `data/public_ingestion/**`.
10. `deletion_candidates`: duplicate generated summaries, stale failed draft files, and obsolete temporary docs/scripts, as candidates only.
11. `keep_do_not_touch`: user-local untracked files, root DOC/PDF files, `data/public_ingestion/`, unrelated web edits, and ignored artifacts.

## Rules

- R26A may recommend deletion, move, or archive actions, but must not perform them.
- R26A must not stage user-local files.
- Root DOC/PDF files and `data/public_ingestion/` are metadata-only and are not training input.
- R24/R25 gates remain preserved.
- Any real cleanup action requires later R26B approval.
