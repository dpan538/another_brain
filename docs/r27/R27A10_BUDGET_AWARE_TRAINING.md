# R27A10 Budget-Aware Training

R27A10 did not start a budget-aware training run.

## Reason

The A8B headline train loss is a last observed training-batch proxy, while dev and stratified heldout are windowed evaluation losses. That makes the A8B train/dev gap a loss-accounting blocker rather than a reliable signal for launching a 60M or 100M repair run.

## Training Policy If Cleared Later

- 60M q4 is the current product-size direction under the full static 100MB budget.
- 100M q4 is research-only under the full static budget unless a later compression/export path proves the full bundle fits with margin.
- Any future run must report `optimizer_tokens` as the primary token metric.
- Any future run must report eval-comparable train/dev/heldout losses before route selection.

## Non-Claims

No training ran in R27A10. No weights, tokenizer artifacts, raw corpus, clean corpus, processed corpus, or run artifacts are committed. R27A10 does not approve phase_4 and does not claim product, browser, or release admission.
