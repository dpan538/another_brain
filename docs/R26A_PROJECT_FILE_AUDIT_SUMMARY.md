# R26A Project File Audit Summary

R26A is non-destructive. It audits and classifies the repository structure without training, tokenizer dry-run, corpus expansion, file deletion, file moves, or private/raw document ingestion.

## Aggregate Counts

| Metric | Count |
| --- | ---: |
| Tracked files | 1279 |
| Status entries, modified/untracked | 56 |
| Ignored status entries | 27 |
| Tracked docs | 240 |
| Tracked training files | 125 |
| Tracked eval files | 150 |
| Tracked scripts | 458 |
| Tracked runtime files | 229 |
| Root DOC/PDF files, metadata-only | 13 |
| data/public_ingestion files, metadata-only | 2920 |
| Ignored artifact files, metadata-only | 854 |
| Tracked model-like files | 0 |

## Tracked Classification

- review_needed: 167
- tracked_active: 943
- tracked_historical: 169

## Local Residue

Root DOC/PDF files and `data/public_ingestion/` remain local/unreviewed and are not training input. Ignored `artifacts/` remain generated local reports/checkpoints/tokenizers and are not commit candidates. R26A did not parse private/root document content.
