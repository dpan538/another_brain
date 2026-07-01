# R25X Phase 3 Review And Data Regularization

R25X reviews phase 3 and designs a possible R25Y data-regularization pilot. It
does not train and does not approve the next run.

R25W showed that R25V's two-layer same-width ablation improved final train loss
slightly against R25S, but worsened final dev and held-out replay loss. R25S
therefore remains the best pilot so far when the local ignored artifacts match
the reported metrics.

The R25X data-quality audit focuses on:

- target-answer repetition
- template near-duplicates
- rejected-answer coverage
- policy-tag, language, task-type, and family balance
- weak buckets from R25Q/R25T/R25W
- split overlap and eval prompt copying
- hidden prompt, chain-of-thought, private path, and secret markers

R25Y is designed as `r25y_data_regularized_192`, using the R25S one-layer
architecture and data-first basis. The design lowers the learning rate, keeps
the same bounded row counts, asks for target repetition caps, and preserves
held-out rows for evaluation only.

R25Y is not approved. Phase_4 scaled training is not approved. Product and
formal training progress remain `0%`; pilot progress remains whatever R25W
reported.
