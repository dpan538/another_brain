# R27A3 Public Training Mix

R27A3 separates candidate records from emitted/trained records. R27A2's `798` was candidate rows before dedup; the trained split sum was `642`.

Declared/candidate records: `5749`. Emitted records after dedup/admission: `5353`. Trained records: `4298`. Split records: `{'train': 4298, 'dev': 542, 'heldout': 513}`.

Curriculum counts: `{'secondary_english_mixed': 3043, 'public_chinese_pretraining': 988, 'user_answered_anchor': 98, 'rag_evidence_grounded': 600, 'reasoning_symbolic': 304, 'value_aesthetic': 320}`. Percentages: `{'secondary_english_mixed': 56.85, 'public_chinese_pretraining': 18.46, 'user_answered_anchor': 1.83, 'rag_evidence_grounded': 11.21, 'reasoning_symbolic': 5.68, 'value_aesthetic': 5.98}`.

Skipped records: `399` with reasons `{'dedup': 396, 'not_engineering_admitted': 3}`.
