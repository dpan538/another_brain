# R26F R26E Promotion Trace Audit

R26F is audit-only. It does not train, does not run tokenizer dry-run, does not alter corpus files, does not change `target_answer`, and does not change R26E metadata. Rows 51-100 from `another_brain_question_pack_001` remain excluded except as exclusion metadata. Any correction requires later R26G approval.

## Result

- R26D generated 97 candidates from 50 answered source rows.
- R26E promoted 45 candidates from 45 unique source rows.
- 42 rejected candidates were duplicate target answers; 42 were same-source source_slice duplicates of an already selected primary candidate.
- 10 rejected candidates came from 5 source rows flagged as project_meta_leakage.
- Therefore the 45 promoted rows are 45 unique source rows, not a statement that only 45 source answers exist or are usable.

## Counts

- source rows 1-50: 50
- R26D candidates: 97
- promoted candidate rows: 45
- promoted unique source_row_id count: 45
- source rows represented in promoted corpus: 45
- source rows with zero promoted candidates: 2, 9, 16, 29, 47
- duplicate target-answer rejections: 42
- project-meta rejections: 10
- project-meta affected source rows: 2, 9, 16, 29, 47
- rows 51-100 used: false

The 45 promoted rows are 45 unique source rows after candidate-level filtering. This does not mean only 45 first-50 source answers were usable.

## Row Trace

| row | module | candidates | promoted | rejected | dup rejected | project-meta rejected | conclusion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 2 | 朋友日常判断 | 2 | 0 | 2 | 0 | 2 | rejected_project_meta_needs_review |
| 3 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 4 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 5 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 6 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 7 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 8 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 9 | 朋友日常判断 | 2 | 0 | 2 | 0 | 2 | rejected_project_meta_needs_review |
| 10 | 朋友日常判断 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 11 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 12 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 13 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 14 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 15 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 16 | 关系语境 | 2 | 0 | 2 | 0 | 2 | rejected_project_meta_needs_review |
| 17 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 18 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 19 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 20 | 关系语境 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 21 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 22 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 23 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 24 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 25 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 26 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 27 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 28 | 不答与边界 | 1 | 1 | 0 | 0 | 0 | promoted_cleanly |
| 29 | 不答与边界 | 2 | 0 | 2 | 0 | 2 | rejected_project_meta_needs_review |
| 30 | 不答与边界 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 31 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 32 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 33 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 34 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 35 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 36 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 37 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 38 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 39 | 无证据挑战 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 40 | 无证据挑战 | 1 | 1 | 0 | 0 | 0 | promoted_cleanly |
| 41 | 怪问题抽象 | 1 | 1 | 0 | 0 | 0 | promoted_cleanly |
| 42 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 43 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 44 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 45 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 46 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 47 | 怪问题抽象 | 2 | 0 | 2 | 0 | 2 | rejected_project_meta_needs_review |
| 48 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 49 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |
| 50 | 怪问题抽象 | 2 | 1 | 1 | 1 | 0 | promoted_after_dedup |

## Missing Artifacts

- none
