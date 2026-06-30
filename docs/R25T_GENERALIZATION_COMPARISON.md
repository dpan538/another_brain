# R25T Generalization Comparison

R25T compares R25S against R25P using ignored local reports only. It does not
train and does not replay training. Held-out replay uses existing replayable
checkpoints only when those ignored artifacts are already present.

The comparison focuses on:

- R25P versus R25S train loss movement
- R25P versus R25S dev loss movement
- R25P versus R25S held-out replay loss
- train/dev and train/held-out gaps
- weak-bucket changes for `zh`, `mixed`, `release_packaging_boundary`,
  `toy_training_boundary`, `verify_draft`, and
  `from_scratch_training_direction`
- whether data-first balancing helped without treating the pilot as product
  capability

If R25S improves dev and held-out loss while reducing train-to-eval gaps, R25T
may recommend `architecture_ablation_design` as a design step. That does not
approve architecture ablation training, phase_4 scaled training, product
training, or static release admission.

The generalization comparison is a small-pilot risk review, not a benchmark and
not proof of product intelligence. R24/R25 gates remain required before any
future reviewer-approved run.
