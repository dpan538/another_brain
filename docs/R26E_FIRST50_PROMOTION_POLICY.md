# R26E First-50 Promotion Policy

R26E may promote only reviewed R26D answer-as-user candidates generated from rows 1-50 of `another_brain_question_pack_001`.

Rows 51-100 remain hard-excluded from training, tokenizer text, teacher probes, candidate generation, corpus promotion, preference pairs, repair pairs, long-horizon rows, and eval-derived training paths. They may appear only as policy evidence or cleanup context.

R26E promotes at most 80 rows. If fewer than 80 pass review, the promotion must promote fewer and report why. Candidate quality is more important than filling the cap.

Hard rejects:
- `source_row_id >= 51`
- blank target answer
- project-management or training-meta answer
- private, local-path, or secret-like content
- generic assistant wording
- duplicated normalized target answer
- fragmented slice that is not meaningful alone
- chain-of-thought or hidden prompt marker
- candidate already marked `training_allowed` or `public_commit_allowed`

Promotion changes selected rows to `reviewed_for_training_corpus`, sets `training_allowed` and `public_commit_allowed` to true, preserves user wording, and records `provenance.promotion_phase` as `R26E`.

R26E does not train, run tokenizer dry-run, call teacher models, parse root documents, parse `data/public_ingestion`, commit artifacts, or commit weights.
