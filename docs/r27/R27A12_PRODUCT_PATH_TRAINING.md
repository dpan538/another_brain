# R27A12 Product Path Training

R27A12 is an engineering product-path training run for the largest q4 near-100M candidate that still fits the full static 100MB browser budget.

It reuses R27A11 corrected loss accounting:

- `optimizer_tokens` is the primary token metric.
- train/dev/heldout loss is token-weighted average negative log likelihood.
- `last_batch_loss` is debug-only.
- ordinary dev-loss no-improvement cannot stop before the minimum budget.

The preferred candidate is `new_96m`. R27A12 may fall back to `new_90m`, `new_80m`, then `new_60m` if model, disk, budget, MPS, or throughput gates require it. `100M` q4 remains research-only.

This is not product training, product admission, browser admission, phase_4, or a release checkpoint.
