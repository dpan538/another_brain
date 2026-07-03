# R25AM Corpus Expansion Summary

R25AM promoted a second bounded set of reviewed repo-derived Chinese-personal rows into tracked corpus split files. R25AM did not train, did not run tokenizer dry-run, did not read private sources, did not use evals as sources, and did not approve phase_4 scaled training.

## Promoted Rows

- Total: 960
- Train/dev/heldout: 768 / 96 / 96
- Language: zh 772, mixed 144, en 44

## Transformation Counts

| Transformation | Rows |
| --- | ---: |
| bounded_judgment | 88 |
| Chinese_explanation | 72 |
| Chinese_follow_up_binding | 72 |
| Chinese_project_decision | 70 |
| Chinese_rewrite_or_compression | 71 |
| local_first_static_browser_reasoning | 72 |
| preference_pair | 88 |
| project_continuation | 88 |
| repair_after_weak_answer | 90 |
| repair_pair | 89 |
| style_preference | 89 |
| tool_status_honesty | 71 |

## Personal Target Coverage

| Target | Rows |
| --- | ---: |
| bounded_judgment | 567 |
| local_first_static_browser_reasoning | 72 |
| project_continuation | 407 |
| repair_after_weak_answer | 250 |
| style_preference | 320 |
| tool_status_honesty | 304 |

## Source Categories

| Category | Rows |
| --- | ---: |
| existing_training_scaffold | 108 |
| identity_style_scaffold | 108 |
| long_horizon_human_seed | 24 |
| project_decision_ledgers | 219 |
| project_meaning_docs | 48 |
| r24_r25_local_first_static_recovery_docs | 225 |
| r25_chinese_personal_cycle_docs | 228 |

## Combined Corpus After R25AM

- Previous rows after R25AK/R25AL: 3200
- Combined rows after R25AM: 4160
- Combined language counts: zh 1956, mixed 1172, en 1032
- Zh share moved from 37.00% to 47.02%.
- En share moved from 30.88% to 24.81%.

R25AM improves the Chinese-first direction, but the full combined corpus still does not reach the future zh >= 70% / en <= 10% target under uniform sampling. Future review should either add more reviewed Chinese-personal rows or use an approved Chinese-first sampler before any bounded training.

Future tokenizer review requires fresh R25AN approval. Future decoder training requires a separate later approval after tokenizer/corpus review.
