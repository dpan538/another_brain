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

At R25X time, R25Y was not approved. A later R25Y run required a fresh
one-shot approval marker and could not be authorized by the R25X template.
Phase_4 scaled training remains not approved. Product and formal training
progress remain `0%`; pilot progress remains separate from product progress.

R25Z later analyzed R25Y and found that the data-regularization run improved
over R25P and R25V but still did not beat R25S. The R25X data-regularization
design therefore remains useful as an experiment, not as evidence to continue
training automatically. Phase_4 scaled training remains blocked.
