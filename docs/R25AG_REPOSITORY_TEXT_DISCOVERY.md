# R25AG Repository Existing Text Discovery

R25AG discovers existing text already inside the repository for possible future Chinese-personal corpus work. It is a catalog step, not a corpus-expansion or training step.

The discovery pass is intentionally conservative:

- It searches only inside the repository root.
- It uses metadata-only handling for root PDF/DOC/DOCX files.
- It uses metadata-only handling for `data/public_ingestion`.
- It treats `evals/**` as eval-only.
- It treats `artifacts/**` as generated local reports/checkpoints/tokenizers that are not committed.
- It does not generate derived rows.
- It does not modify `training/llm_corpus`.
- It does not train or rerun any prior pilot.
- It keeps product/formal training progress at 0%.
- It keeps phase_4 scaled training blocked.

The useful output of R25AG is a candidate source catalog: which tracked docs, corpus scaffolds, long-horizon rows, identity and style scaffolds, and project decision histories may be worth reviewing for later Chinese-first personal corpus expansion. The tracked summaries stay aggregate-only and avoid raw private text.

R25AH later approved deriving candidate rows from selected existing tracked repo text sources only. R25AH still does not train, does not promote rows, does not modify `training/llm_corpus`, and keeps generated candidates under ignored artifacts. R25AI is required before any reviewed R25AH row can be promoted, and any later training would require another fresh approval.
