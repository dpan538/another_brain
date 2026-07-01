# R25W R25V Analysis And Decision

R25W analyzes the existing R25V outputs. It does not run training, does not
rerun R25V/R25S/R25P/R25M/toy training, and does not approve phase_4 scaled
training.

R25V tested `two_layer_same_width` as a bounded phase 3 architecture ablation.
The useful comparison is against R25S, because R25S kept the same 192/48/48
balanced data shape and was the best data-first baseline.

Reported R25V result:

- train loss: `8.476388792196909 -> 2.866081749399503`
- dev loss: `8.501786867777506 -> 5.430544813474019`
- held-out replay loss: `5.244127511978149`
- actual layers: `2`
- phase_4 scaled training: `false`
- product model: `false`
- release checkpoint: `false`

Against R25S, R25V improved final train loss slightly but worsened final dev
loss and held-out replay loss. The two-layer ablation therefore did not improve
generalization, and data-first remains the stronger direction unless later
reviewed evidence says otherwise.

R25W recommendation is reviewer-facing only: pause phase 3 for review, or if
reviewer approval later exists, consider regularization/data refinement before
any further capacity increase. Future training requires a fresh one-shot
approval marker and all R24/R25 gates before and after. Product training
progress remains `0%`.

R25X follows this recommendation by reviewing the phase 3 ledger and designing
an inert R25Y data-regularization pilot. R25X does not train, does not approve
R25Y, and keeps phase_4 scaled training blocked.

R25Y later tested that data-regularization design with fresh one-shot approval.
It improved held-out loss versus R25P and R25V but did not beat the R25S
data-first baseline, so R25S remains the best local phase 3 pilot by current
metrics and phase_4 remains blocked.

R25Z formalizes that review: no new training, R25S remains best-so-far, R25AA
is only an inert template, and the recommended next step is to pause phase 3
for review before considering any fresh-approved follow-up or phase_4 readiness
review without training.
