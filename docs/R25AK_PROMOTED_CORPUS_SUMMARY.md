# R25AK Promoted Corpus Summary

R25AK promoted a bounded reviewed subset of R25AJ unique repo-derived candidates into tracked corpus split files. R25AK did not train, did not run tokenizer dry-run, did not commit ignored artifacts, and did not approve phase_4 scaled training.

## Promoted Rows

- Total: 320
- Train/dev/heldout: 256 / 32 / 32
- Language: zh 224, mixed 68, en 28

## Transformation Counts

| Transformation | Rows |
| --- | ---: |
| bounded_judgment | 32 |
| Chinese_explanation | 31 |
| Chinese_rewrite_or_compression | 35 |
| local_first_static_browser_reasoning | 32 |
| preference_pair | 33 |
| project_continuation | 34 |
| repair_after_weak_answer | 32 |
| repair_pair | 28 |
| style_preference | 31 |
| tool_status_honesty | 32 |

## Personal Target Coverage

| Target | Rows |
| --- | ---: |
| bounded_judgment | 197 |
| local_first_static_browser_reasoning | 94 |
| project_continuation | 282 |
| repair_after_weak_answer | 200 |
| style_preference | 196 |
| tool_status_honesty | 117 |

## Source Categories

| Category | Rows |
| --- | ---: |
| existing_training_scaffold | 58 |
| identity_style_scaffold | 82 |
| long_horizon_human_seed | 20 |
| phase3_decision_docs | 50 |
| project_meaning_docs | 40 |
| repo_docs_for_local_first_static_reasoning | 70 |

## Combined Corpus

- Previous JSONL rows in `training/llm_corpus`: 2880
- Combined JSONL rows after R25AK: 3200
- Combined language counts: zh 1184, mixed 1028, en 988

Future tokenizer review requires fresh approval. Future training requires a separate fresh approval after corpus review.
