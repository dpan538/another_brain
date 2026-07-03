# R25AE Personal Data Inventory Policy

R25AE is a repository-scoped audit only. It does not train, does not expand the
corpus, does not scan outside this repository, does not ingest root PDFs or
DOCX files, and does not parse `data/public_ingestion/` content.

The project remains Chinese-first, personally colored, and project-trained. It
is not being restarted, and existing R24/R25 gates, pilots, datasets, and
decisions remain part of the project. Product and formal training progress stay
at 0%, phase_4 scaled training remains blocked, and no weights or inventory
artifacts are committed.

## Categories

- `tracked_training_corpus`: `training/llm_corpus/*.jsonl`. These rows are
  potentially future training rows only after fresh review and approval.
- `tracked_long_horizon`: `training/long_horizon/*.jsonl`. These behavioral
  rows may be train or eval material depending on split and later review.
- `tracked_eval_only`: `evals/**`. These files are evaluation fixtures, not
  training material unless separately reviewed in a future approved phase.
- `tracked_knowledge_sources`: `knowledge_sources/**`. These are retrieval
  evidence and source cards, not personal training corpus by default.
- `tracked_identity_or_style_scaffold`: `identity_pack/**`, if present. These
  are public scaffold or examples unless explicitly reviewed as private-safe
  training material.
- `tracked_docs`: `docs/`, `README.md`, `DATA_CARD.md`, and `DEPLOYMENT.md`.
  These preserve project history and doctrine; they are not automatically
  training corpus.
- `untracked_root_documents`: root-level PDF/DOC/DOCX-style files. R25AE may
  count metadata only: path class, extension, byte size, and git status. It
  must not extract text.
- `untracked_public_ingestion`: `data/public_ingestion/**`. R25AE may count
  metadata only and must not parse text.
- `ignored_artifacts`: `artifacts/**`. These are local generated reports,
  checkpoints, tokenizers, and run outputs; they are not committed.
- `unknown_or_legacy_scan_outputs`: repo-local inventory, source-list,
  drive-scan, ingestion-manifest, or source-material surfaces. They must be
  classified before any use.

## Forbids

R25AE forbids whole-disk scans, private raw-data ingestion, root PDF/DOCX
parsing, `data/public_ingestion/` parsing, hidden prompts, chain-of-thought,
local private paths in public or tracked corpora, secret-like strings, external
LLM generation, training from evals, and committing generated inventory reports
that contain private file names.

The detailed inventory report is ignored under
`artifacts/training_os/personal_inventory/r25ae/`. Tracked summaries must remain
aggregate-only and must not include raw private text.
