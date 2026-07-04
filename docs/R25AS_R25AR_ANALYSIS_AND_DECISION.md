# R25AS R25AR Analysis And Decision

R25AS is analysis-only. It did not run decoder training, rerun R25AR, run tokenizer dry-run, expand corpus, modify `training/llm_corpus`, approve phase_4, or commit artifacts/weights.

## Classification

- Classification: `repaired_sampler_quality_regressed`
- Recommendation: `pause_phase3_training`
- Best pilot by heldout: `R25S`
- Phase_4 scaled training approved: `false`
- Product/formal training progress: `0%`

## R25AR Metrics

- Train loss: 8.5069 -> 6.3327 (2.1741 decrease)
- Dev loss: 8.5096 -> 6.7373 (1.7722 decrease)
- Heldout loss: 6.8565
- Train/dev gap: 0.4046
- Train/heldout gap: 0.5238
- Dev/heldout gap: 0.1192
- Train language mix: zh 65.10%, mixed 25.00%, en 9.90%
- Bucket loss: zh 6.0836, mixed 8.0400, en 8.1583
- Bucket gaps: mixed-zh 1.9564, en-zh 2.0747

## Regression Read

- R25AR heldout minus R25AO heldout: 1.0746
- R25AR mixed gap minus R25AO mixed gap: n/a
- R25AR en gap minus R25AO en gap: n/a
- Mixed repair helped: `false`
- Lower intensity helped: `false`
- Repaired sampler helped: `false`

R25AR met the repaired sampler mix and reduced train/dev loss, but heldout regressed from R25AO and the mixed/en buckets remained weaker than zh. R25AS therefore does not justify an immediate repeat, tokenizer run, corpus expansion, phase_4 review, or product/formal training.

## Coverage

- Personal target rows: `{"project_continuation":279,"repair_after_weak_answer":202,"local_first_static_browser_reasoning":91,"style_preference":196,"tool_status_honesty":123,"bounded_judgment":247}`
- Risk focus rows: `{"mixed":96,"repair_after_weak_answer":202,"tool_status_honesty":123,"bounded_judgment":247,"local_first_static_browser_reasoning":91}`
- Source contribution: `{"train":{"training/llm_corpus/r25ak_repo_derived_train.jsonl":251,"training/llm_corpus/r25am_repo_derived_train.jsonl":117,"training/llm_corpus/r25l_train.jsonl":11,"training/llm_corpus/train.jsonl":5},"dev":{"training/llm_corpus/r25ak_repo_derived_dev.jsonl":31,"training/llm_corpus/r25am_repo_derived_dev.jsonl":59,"training/llm_corpus/r25l_dev.jsonl":5,"training/llm_corpus/dev.jsonl":1},"heldout":{"training/llm_corpus/r25ak_repo_derived_heldout.jsonl":32,"training/llm_corpus/r25am_repo_derived_heldout.jsonl":47,"training/llm_corpus/r25l_heldout.jsonl":15,"training/llm_corpus/heldout.jsonl":2}}`
- R25AO reference heldout: 5.7820
