# R25O Replayable Checkpoint Protocol

R25O defines a replayable checkpoint protocol for future small pilots. It does
not create a checkpoint and does not run training.

R25M wrote a useful ignored checkpoint digest and run report, but it did not
serialize tensors. That means R25N could not compute true held-out replay loss;
it could only run structural held-out checks. R25P should correct that if a
fresh approval is issued.

Future replayable small-pilot checkpoints must follow
`training/from_scratch/small_decoder_checkpoint.schema.json` and stay under
ignored `artifacts/training_os/small_decoder_pilot/r25p/`. They must be JSON
only for tiny/small replay, not `.bin`, `.pt`, `.safetensors`, `.ckpt`, or other
model-binary formats.

Required boundary fields are:

- `product_model: false`
- `release_checkpoint: false`
- `commit_allowed: false`
- `created_for: "small_decoder_pilot_only"`

A replayable ignored checkpoint is still not a product model, not a release
checkpoint, not a browser static asset, and not commit-allowed. Static release
admission remains a separate R25E/R25H process with explicit release approval,
hashes, provenance, backend-format checks, capacity checks, and R24/R25 gates.

`eval:small-decoder-pilot-replay-heldout` prepares the true held-out replay
entry point. In R25O it skips because no replayable checkpoint exists and the
R25M digest is intentionally classified as non-replayable.
