# R25AA Phase 3 Final Review

R25AA does not run training. It consolidates the completed phase 3 small-pilot
evidence and prepares a pause packet before any future phase_4 design review.

Pilot summary:

- R25M: weak pipeline sanity baseline; useful for mechanics, not replayable and
  not best.
- R25P: first replayable stronger pilot with clear train loss decrease, but a
  moderate train/dev and train/held-out gap.
- R25S: data-first balanced pilot and best-so-far dev/held-out result.
- R25V: two-layer same-width architecture ablation; train improved slightly
  against R25S, but dev and held-out worsened.
- R25Y: data-regularization pilot; better than R25P/R25V but worse than R25S.
- R25Z: recommends pausing phase 3 for review.

The current best pilot is `r25s_data_first_balanced_192`. It is still not a
product model, not a release checkpoint, and not evidence that phase_4 scaled
training is approved.

R25AA decision:

- `phase3_status`: pause for review
- `phase4_scaled_training_approved`: false
- `product_training_progress_percent`: 0
- `formal_training_progress_percent`: 0
- `next_training_requires_fresh_approval`: true

No weights, tokenizer artifacts, checkpoints, or replay reports are committed.
No chain-of-thought data, external APIs, remote downloads, backend inference,
external storage, named pretrained product target, LoRA, adapters, or
fine-tuning final strategy are introduced.
