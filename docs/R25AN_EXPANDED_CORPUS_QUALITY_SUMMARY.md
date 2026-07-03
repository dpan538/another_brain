# R25AN Expanded Corpus Quality Summary

R25AN reviewed tracked corpus JSONL files only. It did not read evals as training data, did not read `private_sources/`, did not parse root PDFs/DOCX, and did not parse `data/public_ingestion/`.

## Aggregate Counts

- Corpus files: 12
- Total rows: 4160
- Split counts: train 2944, dev 608, heldout 608
- Language counts: zh 1956, mixed 1172, en 1032
- R25AK contribution: 320 rows; zh 224, mixed 68, en 28
- R25AM contribution: 960 rows; zh 772, mixed 144, en 44
- Target-answer rows: 4160
- Rejected-answer coverage: 3933 rows / 10746 rejected answers
- Normalized duplicate target count: 0

## Review Notes

R25AM moved the combined corpus toward Chinese-first training: zh share is 47.02%, mixed share is 28.17%, and en share is 24.81%. The full corpus remains below the future zh >= 70% target under uniform sampling, so any later micro-cycle needs a fresh approval and a zh-first sampler or more reviewed Chinese rows.
