# R25AJ Unique Candidate Summary

R25AJ regenerated repo-derived Chinese-personal candidate rows under ignored artifacts only. It did not train, did not promote rows, did not modify `training/llm_corpus`, did not read `private_sources`, did not parse root PDF, DOC, or DOCX files, and did not parse `data/public_ingestion`.

## Candidate Counts

- Candidate rows: 520
- Normalized unique target answers: 520
- Future-promotion-capable unique candidates: 520
- Validation: passed
- Warning count: 0

## Language Distribution

- zh: 364 (70.0%)
- mixed: 104 (20.0%)
- en: 52 (10.0%)

## Split Suggestions

- dev: 52
- heldout_candidate: 52
- train: 416

## Transformation Types

- bounded_judgment: 52
- Chinese_explanation: 52
- Chinese_rewrite_or_compression: 52
- local_first_static_browser_reasoning: 52
- preference_pair: 52
- project_continuation: 52
- repair_after_weak_answer: 52
- repair_pair: 52
- style_preference: 52
- tool_status_honesty: 52

## Personal Target Coverage

- bounded_judgment: 340
- local_first_static_browser_reasoning: 133
- project_continuation: 387
- repair_after_weak_answer: 261
- style_preference: 328
- tool_status_honesty: 240

## Source Categories

- existing_training_scaffold: 60
- identity_style_scaffold: 200
- knowledge_source_metadata: 40
- long_horizon_human_seed: 20
- phase3_decision_docs: 60
- project_meaning_docs: 40
- repo_docs_for_local_first_static_reasoning: 100

R25AJ rows remain ignored artifacts with `review_status:candidate_unreviewed`, `training_allowed:false`, and `public_commit_allowed:false`.

## R25AK Follow-Up

R25AK promotes a bounded reviewed subset from this unique candidate pool into tracked split files. The ignored R25AJ candidate artifact remains uncommitted, and future training still requires a separate approval after corpus review.
