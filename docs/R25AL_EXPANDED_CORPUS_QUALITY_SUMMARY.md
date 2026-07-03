# R25AL Expanded Corpus Quality Summary

R25AL reviewed tracked corpus JSONL files only. It did not read evals as training data, did not read `private_sources/`, did not parse root PDFs/DOCX, and did not parse `data/public_ingestion/`.

## Aggregate Counts

- Corpus files: 9
- Total rows: 3200
- Split counts: train 2176, dev 512, heldout 512
- Language counts: zh 1184, mixed 1028, en 988
- R25AK contribution: 320 rows; zh 224, mixed 68, en 28
- Target-answer rows: 3200
- Rejected-answer coverage: 2973 rows / 8826 rejected answers
- Normalized duplicate target count: 0

## Review Notes

R25AK improved the Chinese-first direction, but the combined corpus zh share is 37%, below the future 70% target for uniform full-corpus use. A later R25AM review must either use Chinese-first sampling or add more reviewed Chinese personal rows. Tokenizer artifacts and weights remain uncommitted.
