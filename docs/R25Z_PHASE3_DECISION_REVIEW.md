# R25Z Phase 3 Decision Review

R25Z consolidates the phase 3 small-pilot results after R25Y:

- R25M: weak pipeline sanity baseline, non-replayable.
- R25P: replayable stronger pilot with moderate train/dev/held-out gap.
- R25S: data-first balanced pilot and current best held-out replay result.
- R25V: two-layer same-width ablation; lower train loss but worse dev and
  held-out loss than R25S.
- R25Y: data-regularization pilot; better than R25P and R25V on held-out loss
  but worse than R25S.

The current best pilot remains `r25s_data_first_balanced_192`. R25Y does not
justify automatic continuation, architecture scaling, or phase_4 scaled
training.

Current decision:

- `phase3_status`: pause for review
- `phase4_scaled_training_approved`: false
- `next_training_requires_fresh_approval`: true
- `recommended_next_training`: none by default

R25AA is an inert template only. It does not authorize training, phase_4 scaled
training, release checkpoint admission, tracked weights, external APIs, remote
downloads, backend inference, external storage, LoRA/adapters/fine-tuning, or a
named pretrained product target.

R25AA later records the phase 3 final review ledger and keeps the phase_4 path
in readiness-review-only mode. Phase_4 training remains blocked until a fresh,
explicit reviewer approval and a separate design review exist.
