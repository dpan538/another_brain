# R25AD R25AC Analysis And Decision

R25AD analyzes the completed R25AC Chinese-first personal micro-cycle. It does
not train, does not rerun R25AC, does not run phase_4, and does not approve a
new micro-cycle.

## R25AC Result

- Run: `r25ac_chinese_personal_microcycle_256`.
- Train loss: `8.547709852457047 -> 3.314068380743265`.
- Dev loss: `8.551121354103088 -> 5.850228309631348`.
- Held-out loss: `5.424156606197357`.
- Train/dev gap: `2.536159928888083`.
- Train/held-out gap: `2.110088225454092`.
- Dev/held-out difference: `-0.4260717034339907`.

The language mix target worked mechanically:

- Train: `zh 180`, `mixed 51`, `en 25`, total `256`.
- Train share: `zh 0.703125`, `mixed 0.19921875`, `en 0.09765625`.
- Held-out: `zh 45`, `mixed 13`, `en 6`, total `64`.

The held-out language buckets show the weakness more clearly:

- `zh`: average next-token loss `4.606971736408416`.
- `mixed`: average next-token loss `7.76533052476786`.
- `en`: average next-token loss `6.352532769358436`.

## Comparison

R25S remains the best reference by held-out loss:

- R25S: `5.069218635559082`.
- R25Y: `5.1359784205754595`.
- R25V: `5.244127511978149`.
- R25P: `5.250599265098572`.
- R25AC: `5.424156606197357`.

R25AC is therefore classified as
`language_mix_success_quality_regressed_vs_r25s`. The Chinese-first sampler and
personal-target coverage are useful, but the current reviewed corpus is not yet
deep enough to make the Chinese-personal micro-cycle improve the best pilot.

## Decision

R25AD pauses after analysis and recommends R25AE as a future corpus-expansion
review pass. R25AE is not approved in R25AD. A later reviewer may approve
corpus expansion only; any later training still needs a separate fresh bounded
approval.

Phase_4 scaled training remains unapproved. Product training progress remains
`0%`; formal decoder training progress remains `0%`; pilot progress remains
`6%`. No artifacts or weights from R25AD are committed.
