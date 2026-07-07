# R28ANCHOR0 Question Anchor Audit

R28ANCHOR0 is an audit-only pass over the committed question-pack metadata and user-answer corpus manifests.

It does not parse root DOCX/PDF files, does not parse `data/public_ingestion`, and does not write raw question or answer text into the summary.

## Current Ledger

The generated summary is:

`data/training_registry/r28anchor0_question_anchor_summary.json`

Observed counts:

- combined user_answered rows: 98
- train anchors: 78
- eval/dev/heldout anchors: 20
- router-surface candidates: 29
- old `question_pack_001` rows 51-100: 50 hard-excluded policy rows
- replacement 51-100 from new pack: 50 promoted rows
- old first-50 rows still needing review: 2

## Source Rules

- `another_brain_question_pack_001` rows 1-50 are candidate/user-answer material only after review and promotion.
- `another_brain_question_pack_001` rows 51-100 remain permanently excluded from training, tokenizer text, teacher probes, corpus generation, corpus promotion, and eval-derived training seeds.
- `another_brain_question_pack_002_abstract_values` is the replacement pack. Its source rows 1-50 may display as replacement 51-100 only when metadata records `replacement_for_pack_id=another_brain_question_pack_001`.
- Dev and heldout rows stay eval/holdout surfaces, even when their metadata says `training_allowed=true` as a corpus eligibility flag.

## Audit Outcome

The current summary passes:

- no old pack rows 51-100 in user_answered corpus
- replacement 51-100 only from the new pack
- no exact eval prompt overlap in user_answered training text hashes
- no hidden prompt, chain-of-thought, private-data, or secret marker in promoted user_answered rows
- no copied target answers in runtime/router files
- no router-surface answer bank
