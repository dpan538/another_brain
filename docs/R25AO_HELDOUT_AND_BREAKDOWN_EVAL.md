# R25AO Heldout And Breakdown Eval

R25AO heldout evaluation replays the ignored JSON checkpoint only. It does not
train, does not run tokenizer dry-run, and does not use heldout text for
training.

## Heldout Replay

- Heldout sequences: 96
- Heldout next-token pairs: 4729
- Aggregate heldout loss: 5.7820
- Heldout loss finite: true
- Heldout language counts: zh 68, mixed 19, en 9
- Train/dev/heldout overlap: false

## Language Buckets

| Bucket | Sequences | Avg Loss | Known Token Rate |
| --- | ---: | ---: | ---: |
| zh | 68 | 5.4540 | 1.000 |
| mixed | 19 | 6.1143 | 1.000 |
| en | 9 | 6.9239 | 1.000 |

## Personal Target Coverage

| Target | Train Rows |
| --- | ---: |
| project_continuation | 275 |
| repair_after_weak_answer | 202 |
| local_first_static_browser_reasoning | 93 |
| style_preference | 190 |
| tool_status_honesty | 144 |
| bounded_judgment | 234 |

The coverage fields come from task-family and policy tags in reviewed corpus
rows; they are not fabricated. Detailed replay artifacts remain ignored.
