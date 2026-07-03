# R25AM Second Chinese Corpus Expansion Policy

R25AM is a bounded corpus expansion and promotion step. It exists because R25AL found that tokenizer readiness was acceptable but the combined tracked corpus still needed more Chinese-personal rows.

R25AM does not train, does not run tokenizer dry-run, does not run a small-pilot, and does not approve phase_4 scaled training.

## Allowed Work

- Generate at least 1200 repo-derived candidates under ignored artifacts.
- Promote at most 960 validated reviewed rows into new tracked corpus split files.
- Use tracked repo sources only.
- Keep train/dev/heldout split separation.
- Keep promoted rows zh >= 80% and en <= 5%.
- Preserve provenance, review status, and no-private-data boundaries.

## Source Policy

Allowed sources are tracked project sources such as project meaning docs, R24/R25 local-first/static/recovery docs, R25AB through R25AL review docs, public identity/style scaffold rows if present, long-horizon human seed rows, and existing training scaffold used as structure only.

Forbidden sources are evals, root PDFs/DOCX/DOC files, `data/public_ingestion/`, `private_sources/`, artifacts/checkpoints/tokenizers, raw private files, and unreviewed local residue.

## Promotion Rules

Rows fail review if they duplicate an existing normalized target answer, differ only by ID/source suffix, contain private data, use eval/private/root document sources, include hidden prompts or chain-of-thought fields, include local absolute paths or secret-like strings, copy a long source passage, or claim product/phase_4/training/tokenizer completion.

Promotion sets `review_status` to `reviewed_for_training_corpus`, `training_allowed` and `public_commit_allowed` to true, and records `provenance.promotion_phase` as `R25AM`.

Future tokenizer review requires fresh R25AN approval. Future decoder training requires another separate approval after tokenizer/corpus review.
