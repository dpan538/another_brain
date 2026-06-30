# R25Q Pilot Analysis And Decision

R25Q analyzes the R25P second bounded small pilot. It does not run training,
does not rerun R25P, does not run a third pilot, and does not scale the
architecture.

R25P produced a replayable held-out-evaluable checkpoint for
`r25p_more_sequences_128`. The result is a useful phase 3 pilot signal, but it
is not product capability, not phase 4 scaled training, not long-term training,
not release checkpoint admission, and not a browser static artifact.

R25Q analysis checks:

- train, dev, and held-out loss behavior
- train/dev and train/held-out gaps
- overfit risk
- replay determinism
- held-out breakdown by language, task type, task family, and policy tag when
  local ignored artifacts are available
- comparison against the R25M non-replayable baseline and R25O expectations
- approval marker safety

The expected decision posture is conservative. R25P loss movement is promising
as a mechanics signal, but train loss improved much more than dev or held-out
loss, so the next step should be reviewed before any additional pilot. R25Q may
recommend that a reviewer consider a data-first or regularization-focused R25R
pilot, but it must not approve R25R automatically.

Product training progress remains `0%`. Formal decoder training progress
remains `0%`. Pilot progress remains separate. Any R25R run requires a fresh
one-shot reviewer approval with a selected `run_id` and must write ignored
artifacts only.

R25Q keeps these boundaries:

- no new training
- no toy, R25M, or R25P rerun
- no product-scale or long-term training
- no phase 4 scaled training approval
- no external APIs, downloads, backend inference, or external storage
- no chain-of-thought data
- no factual knowledge-card expansion
- no named pretrained model selection
- no LoRA, adapters, or fine-tuning as final strategy
- no committed checkpoints, tokenizer artifacts, replay reports, or weights

R24/R25 gates remain required before any later approved pilot.

R25R follows this recommendation with a data-first design for R25S. It does
not run training. The proposed R25S variant is
`r25s_data_first_balanced_192`, which uses balanced sampling, weaker-bucket
upweighting, a lower learning rate, and regularization checks instead of
architecture scale. R25S remains unapproved until a reviewer issues a fresh
one-shot approval marker.

R25S, if approved and run, remains a bounded phase 3 data-first pilot. It is
not product training, not long-term training, not phase_4 scaled training, and
not release checkpoint admission. R25T must analyze R25S before any further
pilot or architecture ablation is considered.

R25T keeps that boundary. It analyzes R25S against R25P, reports whether
data-first balancing helped, and may recommend pause, another data-first pass,
or architecture ablation design. It does not approve R25U automatically, does
not run training, and does not change product training progress from `0%`.
