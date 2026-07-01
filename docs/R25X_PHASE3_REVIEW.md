# R25X Phase 3 Review

R25X consolidates the phase 3 small-pilot evidence after R25V. It does not run
training, does not rerun R25V/R25S/R25P/R25M/toy pilots, and does not approve
phase_4 scaled training.

The review ledger records:

- R25M as a weak, non-replayable pipeline sanity baseline.
- R25P as the first replayable held-out pilot with a moderate gap.
- R25S as the best-so-far data-first pilot with better dev and held-out loss.
- R25V as a two-layer same-width ablation that improved train loss slightly but
  worsened dev and held-out loss versus R25S.

Current phase 3 interpretation:

- current best pilot: `r25s_data_first_balanced_192`
- recommended next direction: data regularization design
- phase_4 scaled training approved: `false`
- next training requires fresh reviewer approval: `true`
- product training progress: `0%`
- formal decoder training progress: `0%`

R25X therefore prepares review artifacts and an inert R25Y design. It does not
authorize R25Y. Any future R25Y pilot would require a new one-shot approval
marker, consumed after use, with all R24/R25 gates green before and after.

No weights are committed. No checkpoint, tokenizer artifact, replay report, or
generated training artifact is tracked. No chain-of-thought data, factual
knowledge-card expansion, external API, remote download, backend inference, or
external storage path is added.
