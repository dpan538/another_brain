# R29A0 96M masked debug training

R29A0 is a bounded causal debug microcycle, not a scale-up run.

- model: `new_96m`
- lineage: R27A12 best product-probe checkpoint
- loss: assistant-response-only; prompt, category, length, evidence-policy, and role-prefix tokens are masked
- learning rate: `5e-6`
- maximum optimizer tokens: `300,000`
- evaluation interval: `50,000` assistant target tokens
- maximum checkpoints retained: 3
- maximum wall time: 2 hours
- device: MPS required
- seed: `2901`

The run stops on heldout regression above 5%, probe-score regression above 0.05, token cap, wall-clock cap, non-finite loss, missing approval, missing checkpoint, MPS unavailability, or disk guard failure.

Promotion requires zero role-prefix leakage, every core probe at least 0.70, and average probe score at least 0.80. Passing the training gate does not grant browser, product, or release admission.

The campaign does not commit weights, tokenizer artifacts, raw or processed corpus, or generated checkpoints.
