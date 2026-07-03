# R25AE Personal Data Inventory

R25AE inventories current personal-data surfaces inside this repository only. It preserves all R24/R25 gates and previous pilot decisions, and it does not train, expand corpus, scan outside the repo root, ingest root PDFs/DOCX, or parse `data/public_ingestion/` content.

The detailed inventory is written to ignored local artifacts. Tracked R25AE docs contain aggregate counts only, with no raw private text and no private document contents.

- Policy: `docs/R25AE_PERSONAL_DATA_INVENTORY_POLICY.md`
- Inventory summary: `docs/R25AE_PERSONAL_DATA_INVENTORY_SUMMARY.md`
- Corpus signal summary: `docs/R25AE_PERSONAL_CORPUS_SIGNAL_SUMMARY.md`
- Legacy scan audit: `docs/R25AE_LEGACY_DISK_SCAN_AUDIT.md`

Phase_4 remains blocked. Product and formal training progress remain 0%. No weights or generated inventory artifacts are committed.

R25AF builds on this inventory by designing a local-only intake path for user writing and poetry. It still does not train, does not expand the corpus, does not parse root PDFs/DOCX, does not parse `data/public_ingestion/`, and does not commit raw personal writing. Raw files remain private/local unless separately approved, while any future R25AG derived corpus expansion would need fresh approval and later training would need another approval.
