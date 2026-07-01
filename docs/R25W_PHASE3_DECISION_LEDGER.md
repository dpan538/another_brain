# R25W Phase 3 Decision Ledger

R25W records the phase 3 small-pilot decision state after the R25V architecture
ablation. It does not run training, rerun R25V, start another pilot, or approve
phase_4 scaled training.

The ledger in `training/from_scratch/phase3_decision_ledger.json` records:

- R25M as a weak pipeline-sanity baseline with non-replayable digest artifacts
- R25P as the first replayable held-out-evaluable small pilot, with a moderate
  train-to-eval gap
- R25S as the data-first balanced pilot that improved dev and held-out behavior
- R25V as a two-layer same-width ablation that improved train loss slightly but
  worsened dev and held-out loss against R25S

The current best pilot remains `r25s_data_first_balanced_192` if the local
ignored reports match the committed R25V summary. R25V does not justify
phase_4, release checkpoint admission, browser deployment, or another automatic
phase 3 run.

Current decision:

- `phase3_continue_or_pause`: `pause_for_review`
- `phase4_scaled_training_approved`: `false`
- `recommended_next_training`: `none_by_default`
- possible next design: regularization or data refinement only, and only after
  fresh reviewer approval

No weights, tokenizer artifacts, replay reports, or checkpoints are committed.
No external APIs, remote downloads, backend inference, external storage,
chain-of-thought data, named pretrained model, LoRA, adapters, or fine-tuning
path is introduced.
