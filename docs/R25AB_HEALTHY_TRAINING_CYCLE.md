# R25AB Healthy Training Cycle

A healthy training cycle is bounded, replayable, and reviewable. It should
increase understanding without turning a single approval into an open-ended
training loop.

## Required Cadence

1. Design.
2. Reviewer approval.
3. One bounded run.
4. Replayable checkpoint.
5. Held-out eval.
6. R24/R25 gates.
7. Comparison to the best pilot.
8. Approval consumed.
9. Analysis.
10. Pause.

## Rules

- No continuous unbounded training.
- No repeated run from the same approval.
- No automatic scale after a good loss.
- No phase_4 unless readiness review and fresh approval pass.
- Best pilot remains a reference, not a product model.
- Product training progress remains 0 until a future explicitly approved
  product-stage phase.
- Formal decoder training progress remains 0 in R25AB.
- R25AB does not train, does not approve R25AC, and does not write weights.

The current reference pilot remains `r25s_data_first_balanced_192`. R25AC may
be designed as a future Chinese-first personal micro-cycle, but it must start
from fresh approval and stop after one bounded run.
