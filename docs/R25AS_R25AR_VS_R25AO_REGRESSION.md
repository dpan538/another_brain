# R25AS R25AR Vs R25AO Regression

R25AS compares completed ignored reports only. It did not rerun R25AR/R25AO, train, run tokenizer dry-run, expand corpus, or approve phase_4.

| Metric | R25AO | R25AR | Delta |
| --- | ---: | ---: | ---: |
| Steps | 100 | 60 | -40 |
| Learning rate | 0.004 | 0.003 | -0.0010 |
| Final train loss | 5.0312 | 6.3327 | 1.3015 |
| Final dev loss | 5.5285 | 6.7373 | 1.2088 |
| Heldout loss | 5.7820 | 6.8565 | 1.0746 |
| Mixed-zh gap | n/a | 1.9564 | n/a |
| En-zh gap | n/a | 2.0747 | n/a |

Result: `repaired_sampler_quality_regressed`. R25AR hit its repaired-sampler mix, but lower intensity and mixed upweighting did not improve heldout quality. Mixed and English remained weak relative to zh, and no immediate repeat or phase_4 escalation is justified.
