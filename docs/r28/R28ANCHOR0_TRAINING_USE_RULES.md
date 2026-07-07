# R28ANCHOR0 Training Use Rules

R28ANCHOR0 does not train. It records which reviewed rows are eligible for later training decisions.

## Train Anchors

A row is classified as `train_anchor` only when:

- it is already committed in a reviewed user_answered corpus file
- `split=train`
- `training_allowed=true`
- `contains_private_data=false`
- provenance says `source_type=user_answered`
- provenance says `external_llm_used=false`
- it is not from old `question_pack_001` rows 51-100

Current count: 78.

## Eval Holdout

A row is classified as `eval_holdout` when:

- `split=dev` or `split=heldout`
- it remains reviewed metadata only for evaluation/selection
- it must not be copied into runtime templates or router surfaces

Current count: 20.

## Needs Review

Old pack rows 1-50 that are not present in the promoted user_answered corpus remain `needs_review`. They are not training anchors until separately reviewed and promoted.

Current needs-review source row ids: 9, 16.

## Excluded Rows

Old `question_pack_001` rows 51-100 are `exclude_old_pack` forever. They may appear as policy evidence or audit metadata, but not as training rows, tokenizer text, teacher probes, synthetic seeds, prompt-generation sources, or eval-derived training.

Replacement display rows 51-100 are allowed only from `another_brain_question_pack_002_abstract_values`.
