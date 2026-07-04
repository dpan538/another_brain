# Question Pack Policy

R26C quarantines the first 100-question answer pack so project-meta prompts cannot become ordinary answer-as-user training data.

## First Pack Boundary

- Pack ID: `another_brain_question_pack_001`.
- Question IDs 1-50: `candidate_review_only`.
- Question IDs 51-100: `excluded_from_training`.

Rows 1-50 are not automatic training rows. They may be reviewed later as answer-as-user candidates, then transformed and approved before any corpus use.

Rows 51-100 are hard-excluded from `training/llm_corpus`, active current corpus manifests, tokenizer training text, corpus generation, corpus promotion, teacher probing, synthetic sample generation, preference-pair generation, repair-pair generation, long-horizon training, and eval-derived training.

Rows 51-100 may be referenced only as policy evidence, cleanup notes, project-management context, or excluded-example audit material. Row 52 is treated as a user policy instruction that later project-meta questions are not suitable for corpus expansion, not as a training sample.

## Future Packs

Any future question pack row that asks about project phase, training direction, internal status, tool state, or corpus strategy is excluded by default until a reviewer reframes it as a real external-facing answer-as-user question. another_brain should learn how the user might answer friends or known-context questions, not how to rehearse its own training pipeline.
