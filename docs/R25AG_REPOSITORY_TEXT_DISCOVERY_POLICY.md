# R25AG Repository Text Discovery Policy

R25AG is a repository-scoped discovery step for the Chinese-first personal browser-decoder project. It searches only inside the repo root, identifies existing text surfaces that may be useful for later review, and produces a candidate source catalog. It does not train, generate corpus rows, promote rows, modify `training/llm_corpus`, approve phase_4, or commit artifacts.

The project is not being restarted and is not trying to clone GPT. Existing R24/R25 gates, pilots, corpus decisions, and safety boundaries remain part of the project. R25AG is discovery/catalog work only.

## Categories

- `tracked_project_docs`: `README.md`, `DATA_CARD.md`, `DEPLOYMENT.md`, and `docs/**/*.md`; candidate source for project meaning, style boundaries, and decision history after review.
- `tracked_training_corpus`: `training/llm_corpus/*.jsonl`; existing scaffold, not modified by R25AG.
- `tracked_long_horizon`: `training/long_horizon/*.jsonl`; behavioral continuity rows for later review.
- `tracked_identity_pack`: `identity_pack/**`, if present; public identity and style scaffold, not raw private data by default.
- `tracked_knowledge_sources`: `knowledge_sources/**`; retrieval evidence, not personal style by default.
- `tracked_eval_only`: `evals/**`; eval-only and not training.
- `untracked_root_documents`: root PDF/DOC/DOCX and similar documents; metadata only.
- `untracked_text_files`: untracked `.txt`, `.md`, `.json`, or `.jsonl` files inside the repo; metadata by default unless a later approval scopes a non-private path.
- `data_public_ingestion`: `data/public_ingestion/**`; metadata only by default.
- `ignored_artifact_reports`: `artifacts/**`; generated reports, checkpoints, and tokenizer artifacts, not committed.
- `possible_legacy_scan_outputs`: manifests, inventories, path lists, and early scan attempts; classified before any use.

## Boundaries

R25AG does not parse root PDF/DOCX content and does not bulk-parse `data/public_ingestion`. It does not copy private raw text into tracked docs. It does not scan outside the repo root, call external APIs, download models, introduce a named pretrained model, add LoRA/fine-tune/adapters as the final strategy, add backend/storage/API paths, add chain-of-thought data, or include hidden prompts.

Generated detailed reports live under `artifacts/training_os/repo_text_discovery/r25ag/` and remain ignored. Tracked summaries are aggregate-only and contain no raw private text, long excerpts, local private absolute paths, weights, or generated corpus rows.

Future R25AH work may propose source-specific promotion or derived-row generation from selected existing repo text sources, but only after explicit review and approval. Future training still requires another fresh approval. Phase_4 scaled training remains blocked.
