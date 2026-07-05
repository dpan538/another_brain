# R26H R26I Training-Entry Plan

R26H simulates the R26I training-entry plan without training and without writing train/dev/heldout dataset files.

## Proposed R26I Microcycle

- Run id: `r26i_answer_as_user_microcycle`
- Train/dev/heldout planned counts: 192/48/48
- User-answer counts: train 78, dev 10, heldout 10
- User-answer shares: train 40.6%, dev 20.8%, heldout 20.8%
- Max context tokens: 64
- Max steps: 50
- Learning rate: 0.0025
- Batch size: 4
- Architecture: same 1-layer causal decoder pilot baseline
- Decision status: plan_ready

This is a bounded answer-as-user microcycle plan only. R26I is not automatically approved; product/formal training progress remains 0%, phase_4 remains blocked, and no weights or artifacts are committed.
