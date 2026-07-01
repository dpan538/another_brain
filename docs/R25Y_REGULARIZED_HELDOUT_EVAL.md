# R25Y Regularized Held-Out Eval

R25Y held-out replay evaluates the already-written ignored R25Y JSON
checkpoint. It does not train.

Evaluation input comes only from the R25L held-out split:
`training/llm_corpus/r25l_heldout.jsonl`. The held-out rows are not used for
training, and the replay check verifies no train/dev/held-out overlap.

R25Y replay result:

- held-out sequences: `48`
- held-out token pairs: `1332`
- held-out loss: `5.1359784205754595`
- finite held-out loss: `true`
- train/dev/held-out overlap: `false`
- product model: `false`
- release checkpoint: `false`
- phase_4 scaled training: `false`

Comparison summary:

- R25Y vs R25S held-out delta: `+0.06675978501637747`
- R25Y vs R25V held-out delta: `-0.10814909140268991`
- R25Y vs R25P held-out delta: `-0.11462084452311228`

The data-regularization pilot improved held-out loss relative to R25P and
R25V, but it did not beat R25S. The post-R25Y recommendation is to stop and
review before any further pilot or phase_4 readiness review. No automatic
scaling is approved.

The replayable checkpoint remains an ignored pilot artifact only. It must not
be committed, copied into browser runtime assets, treated as a release
checkpoint, or used as static LLM production deployment evidence.
