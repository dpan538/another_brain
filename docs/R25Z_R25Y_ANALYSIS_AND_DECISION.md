# R25Z R25Y Analysis And Decision

R25Z does not run training. It analyzes the already completed R25Y
data-regularization pilot and updates the phase 3 review boundary.

R25Y used the `r25y_data_regularized_192` design: one-layer
`causal_decoder_pilot`, `566080` parameters, `192 / 48 / 48`
train/dev/held-out sequences, and a lower learning rate than R25S.

Observed R25Y losses:

- train loss: `8.522901693979898 -> 3.0795193960269294`
- dev loss: `8.5032852490743 -> 5.429250796635945`
- held-out replay loss: `5.1359784205754595`

R25Y improved held-out loss relative to R25P and R25V, but it did not beat
R25S. R25S remains best-so-far by the local replayed held-out metric unless
future review finds a structural issue in the ignored artifacts.

R25Z recommendation is conservative: pause phase 3 for review before any
additional pilot. A phase_4 readiness review may be discussed separately, but
phase_4 scaled training is not approved by R25Z.

Boundaries:

- product training progress remains `0%`
- formal decoder training progress remains `0%`
- pilot progress remains separate from product progress
- phase_4 scaled training is not approved
- future training requires fresh reviewer approval
- no weights are committed
- no chain-of-thought data is added
- no external APIs, remote downloads, backend inference, or external storage are
  introduced
- R24/R25 gates remain required
