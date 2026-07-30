# R27A2 Public Training Mix

Target mix is Chinese-first, but blocked public corpus sources are not faked. This run uses approved anchors, RAG/evidence rows, symbolic reasoning, and value/aesthetic rows unless public cleaned samples exist.

Required curricula are declared in the manifest. Public and instruction-distillation curricula remain at zero when license/access is not approved; this is intentional and not backfilled with fake samples.

Candidate records before admission/dedup: `798`.

Emitted records after admission/dedup: `642`.

Split records: `{'train': 498, 'dev': 74, 'heldout': 70}`.

Trained records for the R27A2 engineering run: `498`.

Curricula emitted to splits: `{'user_answered_anchor': 98, 'rag_evidence_grounded': 240, 'reasoning_symbolic': 300, 'value_aesthetic': 4}`.

The R27A2 `798` value is a candidate-row count, not a trained-row count. R27A3 keeps this accounting distinction explicit in its manifest and tests.
