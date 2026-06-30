# R25M Small Decoder Pilot Run

R25M runs a bounded `phase_3_small_decoder_pilot` only when the narrow reviewer
approval marker exists and the command includes `--allow-small-pilot-training`.
It uses the R25L train split, the R25L dry-run tokenizer, and writes only ignored
artifacts under `artifacts/training_os/small_decoder_pilot/r25m/`.

This run is not product-scale training, not long-term training, not a browser
static artifact, and not a release checkpoint. It does not authorize static
release admission, tracked weights, Vercel backend inference, external APIs,
remote downloads, LoRA, adapters, fine-tuning, or named pretrained models.

The pilot trains a tiny from-scratch causal decoder pilot when a local numeric
backend is already installed. If the environment has no local numeric backend,
R25M must report an honest blocked status and must not claim pilot progress.

Loss decrease and finite dev loss are mechanics signals only. They show that
dataset building, tokenization, model initialization, bounded training, and
metric reporting can run locally; they do not prove product intelligence.

After the pilot, R24/R25 recovery, split-integrity, no-hardcoding, artifact, and
Vercel static gates remain required. No generated checkpoint, tokenizer artifact,
or training report may be staged or committed.

R25N consumes the R25M one-shot approval marker after commit
`56613c64ef2c7400f13be051030c09883877fa5d`. The consumed marker is historical
only and cannot authorize another pilot run. R25N may analyze the ignored R25M
reports and run structural held-out evaluation, but it must not rerun small
pilot training.

R25O classifies the R25M checkpoint as a non-replayable legacy digest. It is
useful for audit and comparison, but not for true held-out loss replay. Any
future R25P checkpoint should use the R25O replayable JSON schema while staying
ignored, untracked, non-product, and non-release.

R25P does not retroactively change R25M. R25M remains the first bounded pilot
baseline, with a non-replayable digest checkpoint. R25P comparisons should treat
R25M as historical evidence only and must not rerun R25M training.
