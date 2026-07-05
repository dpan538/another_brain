# R26F Next Step Recommendation

R26F is audit-only. It does not train, run tokenizer dry-run, expand corpus, promote corpus rows, mutate `training/llm_corpus`, change `target_answer`, or change R26E metadata. Rows 51-100 remain excluded. Any correction requires later R26G approval.

## Recommendation

- recommendation: manual_review_needed
- training approved now: false
- corpus mutation approved now: false
- safe next step: Request explicit R26G approval for metadata-only should_answer correction and manual re-promotion review of omitted first-50 rows; do not train.
- R26G status: completed after explicit approval. R26G fixed R26E response-obligation metadata, recovered rows 2, 29, and 47, kept rows 9 and 16 out of automatic promotion, and intook replacement 51-100 as a new pack without training.

## Why R26E Promoted 45 Rows

- R26D generated 97 candidates from 50 answered source rows.
- R26E promoted 45 candidates from 45 unique source rows.
- 42 rejected candidates were duplicate target answers; 42 were same-source source_slice duplicates of an already selected primary candidate.
- 10 rejected candidates came from 5 source rows flagged as project_meta_leakage.
- Therefore the 45 promoted rows are 45 unique source rows, not a statement that only 45 source answers exist or are usable.

## Source Rows With Zero Promoted Candidates

| row |
| --- |
| 2 |
| 9 |
| 16 |
| 29 |
| 47 |

## Likely Parser Bugs

- blank optional raw CSV 是否回答 values mapped to should_answer=false in promoted rows

## Must Not Do

- do not train
- do not run tokenizer dry-run
- do not mutate training/llm_corpus in R26F
- do not use rows 51-100 as training material
- do not call external APIs or Doubao
- do not commit artifacts, raw CSV/XLSX, or weights

## R26G Follow-Up

R26G treated replacement 51-100 as `another_brain_question_pack_002_abstract_values`, not as a reopening of old excluded question_pack_001 rows 51-100. Future R26H readiness review is still required before any training discussion.
