# Small Decoder Replayable Checkpoint Protocol

R25O defines a future replayable checkpoint format for bounded small decoder
pilots only. It does not run training and does not create a checkpoint.

The schema in `small_decoder_checkpoint.schema.json` is for ignored JSON
artifacts under `artifacts/training_os/small_decoder_pilot/`. It is not a
static release manifest, not a production model artifact, and not permission to
commit weights.

Required safety fields keep the boundary explicit:

- `product_model: false`
- `release_checkpoint: false`
- `commit_allowed: false`
- `created_for: "small_decoder_pilot_only"`

Replayable JSON checkpoints may store tiny/small pilot tensors for held-out
loss replay only if a later reviewer-approved run writes them to ignored
artifacts. The format must not use `.bin`, `.pt`, `.safetensors`, `.ckpt`, or
other model-binary extensions. Future production or browser release admission
still requires the R25E/R25H static artifact gates, release-scoped approval,
provenance review, static budget checks, and R24/R25 regression gates.

R25M is historical evidence but not a replayable checkpoint: its checkpoint is
a digest/report artifact with no serialized tensors, so R25N could only run a
structural held-out metric. R25P should use this schema if a fresh one-shot
approval authorizes a second bounded pilot.
