# R27A7R2 Safe Checkpoint Selection

- Selected checkpoint: `artifacts/r27a7/model_lab/checkpoints/r27a7_mps_24h_large_decoder_v1_seg1_scale_warmup.pt`
- Selected kind: `r27a7_best_product_probe`
- Exists in local artifacts: `True`
- Final checkpoint: `artifacts/r27a7/model_lab/checkpoints/r27a7_mps_24h_large_decoder_v1_seg3_dialogue_sft.pt`
- Final checkpoint selected: `False`
- Worse final checkpoint rejected: `True`
- Tokenizer path: `artifacts/r27a4/model_lab/tokenizer/tokenizer.json`

- Prefer R27A7 best_product_probe, then best_dev_loss, then best segment, then R27A6.
- Old A7R partial checkpoints are evidence only and are not default resume targets.
- Final checkpoint is not selected when a better checkpoint exists.
