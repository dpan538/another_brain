# R25AR Repaired-Sampler Micro-Cycle Run

R25AR ran exactly one approved bounded phase_3 small decoder pilot:

- Run id: `r25ar_repaired_sampler_microcycle`
- Variant: `r25ar_mixed_repair_lower_intensity`
- Backend: local `python_torch`
- Architecture: one-layer causal decoder pilot, R25S-basis, hidden size 64, 4 heads
- Dataset: train/dev/heldout = 384 / 96 / 96
- Steps: 60
- Learning rate: 0.003
- Tokenizer: existing R25AN dry-run artifact

The repaired sampler met its target:

- Train language counts: zh 250, mixed 96, en 38
- Train language mix: zh 65.10%, mixed 25.00%, en 9.90%
- Dev language counts: zh 63, mixed 24, en 9
- Heldout language counts: zh 63, mixed 24, en 9

Loss behavior:

- Train loss: 8.5069 -> 6.3327
- Dev loss: 8.5096 -> 6.7373
- Heldout loss: 6.8565

R25AR shows that the repaired sampler and lower-intensity run can execute, but it does not show improved heldout quality. R25AR is still a bounded pilot only, not product/formal training and not a release artifact.

Boundaries:

- No tokenizer dry-run ran in R25AR.
- No corpus expansion ran in R25AR.
- No phase_4 scaled training ran or was approved.
- No product or formal decoder training ran.
- No artifacts or weights are commit candidates.
- Future work requires fresh approval.
