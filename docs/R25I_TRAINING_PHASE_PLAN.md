# R25I Training Phase Plan

Current state after R25L can be `phase_3_small_decoder_pilot_planned` when the
expanded corpus, R25L tokenizer dry-run, and small pilot plan pass. That is a
planning state only. Formal decoder training remains unstarted.

Formal training progress remains `0%`. Training-readiness can improve through
schemas, review gates, and dry-run validators, but that is not model training.

| Phase | Entry Criteria | Exit Criteria | Artifacts | Gates | Rollback Triggers |
| --- | --- | --- | --- | --- | --- |
| `phase_0_no_training_current` | R25H capacity envelope green | Doctrine, release-decision schema, architecture/tokenizer/corpus plans exist | Docs and schemas only | R25I/R25H/R24 gates | Any claim that training started or weights exist |
| `phase_1_tokenizer_dry_run` | Reviewed corpus plan and contamination checks green | Local tokenizer dry-run report with held-out tokenization eval | tokenizer reports under ignored artifacts | corpus, contamination, no-private-data, no-CoT gates | eval leakage, private data, unstable normalization |
| `phase_2_tiny_overfit_sanity` | Tokenizer dry-run accepted | Tiny toy decoder proves pipeline mechanics only | ignored toy checkpoint, metrics report | no-weight-commit, training provenance, toy-only label | toy model described as product |
| `phase_3_small_decoder_pilot` | Toy pipeline stable, corpus expanded | Small from-scratch decoder pilot measured against R24/R25 | ignored checkpoint and eval reports | held-out, anti-lobotomy, dialogue, no-backend | regression in recovery or privacy gates |
| `phase_4_scaled_decoder_training` | Pilot passes, capacity plan reviewed | Larger from-scratch model fits Pro static envelope in plan | training run report, checkpoint metadata | R24/R25, capacity, license/provenance | exceeds Pro envelope or fails held-out gates |
| `phase_5_quantize_and_static_release` | Reviewed checkpoint selected for release | Static artifact, manifest, hashes, and release decision pass admission | static release candidate | R25E/R25H, no-unapproved-weights | missing hashes, backend mismatch, budget fail |
| `phase_6_gated_browser_draft` | Real first-token gate passes | Disabled-by-default draft path behind verifier/fallback | runtime flag, browser smoke report | first-token, contract, fallback firewall | fixture output or unsafe draft surfaces |
| `phase_7_long_run_training` | All earlier gates stable | Longer training only with split integrity and route audits green | long-run reports | held-out, route distribution, provenance | overfit, collapse, backend drift |

R25J adds tokenizer dry-run commands and a toy decoder scaffold. R25K may run a
toy-only sanity loop after explicit approval. R25L expands corpus rows and
plans the phase 3 pilot, but `run:small-decoder-pilot` still skips by default.
R25M may run one bounded phase 3 small decoder pilot after explicit approval.
That pilot writes ignored artifacts only, is not long-term or product-scale
training, is not release checkpoint admission, and leaves product training
progress at `0%`.

R25N evaluates the R25M outputs and consumes the R25K/R25M one-shot approval
markers. It does not run new training. If analysis and structural held-out
evaluation pass, the phase label may become
`phase_3_small_decoder_pilot_evaluated`; product training progress remains
`0%`, and future training still requires a fresh approval marker.

R25O may move the planning label to `phase_3_second_small_pilot_designed` after
the second-pilot plan, replayable checkpoint schema, replay-heldout scaffold,
approval template, and history comparison pass. This is still a design state
only: no second pilot is approved, no new training runs, product training
progress remains `0%`, and pilot progress remains separate at the R25M level.

R25P may run exactly one reviewer-approved second bounded pilot variant,
`r25p_more_sequences_128`, and then must consume its approval marker. If the
run, dev sanity eval, replayable checkpoint validation, and held-out replay pass,
the label may become `phase_3_second_small_pilot_completed`. This still is not
phase 4 scaled training, product-scale training, long-term training, release
checkpoint admission, or browser static deployment. Product and formal training
progress remain `0%`; pilot progress remains separate.

R25Q may move the label to `phase_3_second_small_pilot_analyzed` after R25P
analysis, replay determinism, held-out breakdown, history comparison, and the
R25Q decision report pass. R25Q does not run training, does not rerun R25P, and
does not approve R25R or phase 4 scaled training. Product and formal training
progress remain `0%`; pilot progress remains separate at `2%`.

R25R may move the label to `phase_3_data_first_third_pilot_designed` after the
R25S balanced sampling plan, R25S inert approval template, R25S run-config
template, design validator, and reviewer decision report pass. R25R does not
run training, does not rerun R25P, does not approve R25S, and does not approve
phase 4 scaled training. Product and formal training progress remain `0%`;
pilot progress remains separate at `2%`.

R25S may run exactly one reviewer-approved data-first bounded pilot variant,
`r25s_data_first_balanced_192`, and then must consume its approval marker. If
the run, replayable checkpoint validation, held-out replay, history comparison,
artifact guard, and R24/R25 gates pass, the label may become
`phase_3_data_first_third_pilot_completed`. This remains phase 3 small-pilot
work: not product-scale training, not long-term training, not phase_4 scaled
training, not release checkpoint admission, and not browser static deployment.
Product and formal training progress remain `0%`; pilot progress may increase
separately to `3%`.

R25T may move the label to `phase_3_data_first_pilot_analyzed` after R25S
analysis, R25S held-out breakdown, R25P/R25S generalization comparison, and the
R25T next-step decision report pass. R25T does not run training, does not rerun
R25S, and does not approve R25U or phase 4 scaled training. Product and formal
training progress remain `0%`; pilot progress remains separate at `3%`.

R25U may move the label to `phase_3_exit_criteria_and_ablation_planned` after
phase 3 exit criteria, phase_4 readiness reporting, architecture ablation
planning, and the R25U phase decision report pass. R25U does not run training,
does not approve R25V, and does not approve phase_4 scaled training. Phase_4
remains blocked until criteria pass and a reviewer gives fresh explicit
approval. Product and formal training progress remain `0%`; pilot progress
remains separate at `3%`.

R25V may run or safely block exactly one reviewer-approved architecture
ablation variant, `two_layer_same_width`, and then must consume its approval
marker. If the run, replayable checkpoint validation, held-out replay, history
comparison, artifact guard, and R24/R25 gates pass, the label may become
`phase_3_architecture_ablation_pilot_completed`. This remains phase 3
small-pilot work: not product-scale training, not long-term training, not
phase_4 scaled training, not release checkpoint admission, and not browser
static deployment. Product and formal training progress remain `0%`; pilot
progress may increase separately to `4%`.

R25W may move the label to `phase_3_architecture_ablation_analyzed` after R25V
analysis, R25V held-out breakdown, data-vs-architecture comparison, the phase 3
decision ledger, and the R25W next-step decision report pass. R25W does not run
training, does not rerun R25V/R25S/R25P/R25M/toy pilots, and does not approve
R25X or phase_4 scaled training. Product and formal training progress remain
`0%`; pilot progress remains separate at `4%`.

R25X may move the label to `phase_3_review_and_data_regularization_designed`
after the phase 3 review ledger, R25X data-quality audit, R25S best-row
analysis, inert R25Y design/template validation, and R25X decision report pass.
R25X does not run training, does not rerun any consumed pilot, does not approve
R25Y, and does not approve phase_4 scaled training. Product and formal training
progress remain `0%`; pilot progress remains separate at `4%`.

## Failure Modes To Watch

- Treating external model admission as product model selection.
- Treating LoRA or adapters as the final strategy.
- Expanding answer banks instead of training a general decoder.
- Allowing eval prompts into training.
- Claiming first-token success from fixture output.
- Weakening R24 recovery gates to make a model appear better.
- Reusing a consumed approval marker to rerun toy or small-pilot training.
- Treating a replayable ignored small-pilot checkpoint as a release checkpoint.
- Treating R25Q analysis as automatic approval for R25R or phase 4 scaling.
- Treating the R25S inert template as approval to run a third pilot.
- Treating the R25S bounded pilot as approval for phase_4 scaled training.
- Treating R25T analysis as approval to run R25U or phase_4 scaled training.
- Treating R25U exit criteria or an R25V template as approval for training.
- Treating R25V ablation output as phase_4 approval or a release checkpoint.
- Treating R25W analysis or the R25X inert template as approval for new
  training or phase_4 scaled training.
- Treating R25X review or the R25Y inert template as approval for a
  data-regularization pilot or phase_4 scaled training.
