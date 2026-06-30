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
