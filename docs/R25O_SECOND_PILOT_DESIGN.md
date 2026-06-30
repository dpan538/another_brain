# R25O Second Pilot Design

R25O designs a future R25P second bounded small decoder pilot. It does not run
training, does not rerun R25M, does not write weights, and does not approve a
second pilot.

The recommended R25P variant is selected by
`scripts/plan_second_small_decoder_pilot.mjs` from
`training/from_scratch/small_decoder_second_pilot_config.json`. The current
conservative recommendation is expected to favor `r25p_more_sequences_128`
because R25M produced only a small but valid loss decrease. More sequences are
a cleaner next variable than changing architecture, context length, and learning
rate all at once.

The R25P approval template is committed with `approved:false` and
`allow_small_pilot_training:false`. It is safe to commit because it cannot
authorize training. Any future R25P run requires a copied, fresh one-shot marker
with explicit reviewer approval, a matching run id, no product-training
permission, no long-term-training permission, no release-checkpoint permission,
and `allow_weight_commit:false`.

R25O keeps these boundaries:

- no product-scale training
- no long-term training
- no rerun of R25K or R25M
- no tracked checkpoints or reports
- no generated tokenizer artifacts committed
- no external APIs or downloads
- no backend or storage inference path
- no chain-of-thought data
- no named pretrained model selection

R24/R25 gates remain required before and after any later approved R25P run.
Product training progress remains `0%`; pilot progress remains separate.

R25P follows this design with a fresh reviewer approval for exactly
`r25p_more_sequences_128`. The R25P approval is one-shot, is consumed after the
run, and does not authorize any other variant, long-term training,
product-scale training, release admission, backend inference, external APIs,
downloads, or committed weights.

R25Q analyzes the R25P result before any R25R decision. R25Q must not run
training. It adds an inert R25R approval template with `approved:false`; that
template cannot authorize training and exists only to document the fields a
future reviewer would need to fill explicitly.
