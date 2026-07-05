# R26G Fix And Intake User Answers

R26G fixes R26E response-obligation metadata and intakes the approved replacement 51-100 user-answer pack. R26G does not train, run tokenizer dry-run, run small-pilot training, run phase_4, call external APIs, call Doubao, commit raw private source files, commit artifacts, or commit weights.

## Scope

- R26E target answers, questions, sample IDs, source row IDs, and row order are preserved.
- R26E `should_answer` is normalized from parser-derived `false` to output-obligation `true`.
- R26E rows receive `response_obligation: produce_response`, `direct_compliance`, `valid_nonanswer`, and R26G metadata-fix fields.
- Omitted first-50 rows 2, 29, and 47 are recovered into R26G corpus splits.
- Omitted row 9 remains manual-review only.
- Omitted row 16 remains excluded as training-meta.
- Replacement 51-100 is parsed only from the approved ignored private source path.
- Replacement 51-100 is treated as `another_brain_question_pack_002_abstract_values`, with internal `source_row_id` 1-50 and display IDs 51-100.
- Old question_pack_001 rows 51-100 remain excluded.

## Result

- R26E rows metadata-fixed: 45
- R26E `should_answer` before: `false` = 45
- R26E `should_answer` after: `true` = 45
- R26E `response_obligation`: `produce_response` = 45
- replacement rows parsed: 50
- replacement candidates generated: 50
- replacement rows promoted: 50
- omitted first-50 rows promoted: 2, 29, 47
- total R26G promoted rows: 53
- R26G split counts: train 43, dev 5, heldout 5
- combined user_answered rows after R26G: 98
- combined full training corpus rows after R26G: 1858

## Boundary

R26G is corpus review/intake only. Future R26H readiness review is required before any training discussion. No automatic training is authorized.
