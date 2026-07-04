# R25AP Next-Step Boundary

R25AP is an analysis boundary after the R25AO expanded Chinese-personal
micro-cycle. It does not authorize any additional training.

## Recommendation

`pause_for_review`

R25AO met the zh-first sampler target and reduced train/dev loss, but heldout
loss regressed against the best previous reference. Mixed and English buckets
are weak relative to Chinese, and several heldout task families need qualitative
review.

## Allowed Next Work

Future work may be proposed only with fresh approval:

- adjust sampler or review corpus without training
- expand Chinese-personal corpus with reviewed sources
- reduce future training intensity
- run another bounded micro-cycle later with a fresh approval
- pause without further action

## Still Blocked

- no R25AO rerun from the consumed approval
- no tokenizer dry-run without fresh approval
- no corpus expansion without fresh approval
- no phase_4 scaled training
- no product-scale or formal decoder training
- no release checkpoint admission
- no committed artifacts or weights

The inert R25AQ template exists only as a placeholder for a future reviewed
step. It does not approve training, tokenizer dry-run, corpus expansion, or
phase_4.

## R25AQ Follow-Up

R25AQ uses that analysis boundary to diagnose R25AO and design an inert R25AR
candidate. It does not justify an immediate repeat. R25AR remains
`approved:false`, and any future bounded pilot requires a fresh explicit
approval that must be consumed after one attempt.
