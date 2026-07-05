# R27A6 R27A5 Evidence Audit

R27A5 dev loss was `5.901535924275716` and heldout loss was `3.613674759864807`. The audit classification is `possible_curriculum_mismatch` and the decision is `proceed_with_stratified_heldout`.

Dev token-length mean: `503.08`. Heldout token-length mean: `499.65`. Cross-split duplicate count: `0`.

The lower heldout loss is treated as a split-composition/length/curriculum imbalance unless duplicate leakage or an evaluation-accounting bug is detected. R27A6 therefore builds a stratified heldout stream before autonomous training. Rows 51-100 from the old question pack remain excluded.
