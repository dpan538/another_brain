# R25R Data-First Third Pilot Design

R25R does not run training. It converts the R25Q analysis into a design for a
future R25S bounded pilot, but it does not rerun R25P, does not run a third
pilot, does not scale architecture, and does not write weights.

R25P improved strongly on train and dev loss, but R25Q classified the result as
`generalization_uncertain` with `moderate` overfit risk. The train/dev and
train/held-out gaps mean the next useful question is data coverage and
regularization, not a bigger architecture.

R25S should therefore be data-first:

- select more training rows with balanced language coverage
- upweight the weaker R25Q buckets: `release_packaging_boundary`,
  `toy_training_boundary`, `verify_draft`, and
  `from_scratch_training_direction`
- keep train, dev, and held-out rows split-separated
- lower the learning rate from the R25P pilot
- shuffle train rows deterministically
- cap repeated targets
- check dev loss during the run
- stop on dev-loss worsening if a future approved runner implements that guard

R25S is not approved by R25R. It requires a fresh one-shot reviewer approval
with an explicit `run_id` and `variant_id`. The committed R25S approval template
uses `approved:false` and `allow_small_pilot_training:false`, so it cannot
authorize training.

R25R boundaries:

- product training progress remains `0%`
- formal decoder training progress remains `0%`
- pilot progress remains `2%`
- phase 4 scaled training is not approved
- no product model exists
- no release checkpoint is admitted
- no weights are committed
- no chain-of-thought data is added
- no factual knowledge-card expansion is added
- no external APIs, remote downloads, backend inference, or external storage
  are used
- no LoRA, adapters, or fine-tuning path is introduced as the final strategy

R24/R25 gates remain required before and after any later reviewer-approved R25S
run.
