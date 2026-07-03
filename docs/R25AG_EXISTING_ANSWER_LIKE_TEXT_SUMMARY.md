# R25AG Existing Answer-Like Text Summary

R25AG counted answer-like and dialogue-like material already present in tracked repo surfaces. This audit is aggregate-only: it did not generate corpus rows, modify `training/llm_corpus`, train, or copy raw private text.

## Row Counts

- training_corpus_other: 480
- training_corpus_dev: 400
- training_corpus_heldout: 400
- training_corpus_train: 1600
- long_horizon: 54
- identity_pack: 110
- knowledge_sources: 55154
- eval_only: 5277

## Answer-Like Counts

- Total answer-like fields: 73106
- target_answer rows: 2880
- rejected_answers rows: 2880
- rejected_answers total items: 8640
- messages rows: 2880
- expected_behavior rows: 2934
- scoring_rubric rows: 54

## Training Corpus Language Mix

- zh: 960
- mixed: 960
- en: 960

## Personal-Color Signals

- project_continuation: 58630
- repair_after_weak_answer: 1382
- local_first_static_browser_reasoning: 3079
- style_preference: 3000
- tool_status_honesty: 467
- bounded_judgment: 7209

## Duplicate/Boilerplate Risk

- Duplicate target-answer groups: 0
- Repeated target-answer rows: 0

Detailed row-level metadata is written only to ignored artifacts.

