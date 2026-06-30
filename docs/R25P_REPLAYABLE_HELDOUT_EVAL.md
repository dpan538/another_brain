# R25P Replayable Held-Out Eval

R25P adds true held-out replay for small-pilot checkpoints that follow
`training/from_scratch/small_decoder_checkpoint.schema.json`.

The R25M checkpoint was a legacy digest and could not replay model loss because
it did not serialize tensors. R25P corrects that for the approved
`r25p_more_sequences_128` pilot by writing an ignored JSON checkpoint with the
small decoder-like parameters needed to compute held-out next-token loss.

`eval:small-decoder-pilot-heldout:r25p` does not train. It loads the ignored
R25P replayable checkpoint, reads the prepared R25L held-out sequences, checks
train/dev/held-out separation, and computes a finite held-out loss when the
checkpoint layout is supported.

The held-out loss is a structural pilot metric, not a product benchmark and not
a claim of model intelligence. It is useful because it proves that a future
small-pilot checkpoint can be replayed independently of the training command.

Replay boundaries:

- no held-out text is used for training
- no eval prompts are read
- no product model or release checkpoint is created
- no model-like binary files are written
- no checkpoint or replay report is staged or committed
- no external APIs, downloads, backend storage, or Vercel inference path is used

Any future replayable checkpoint with a different architecture must add a
matching replay implementation before held-out loss can be treated as a valid
pilot metric.

R25Q extends this replay path with deterministic repeat checks and held-out
breakdowns by language, task type, task family, and policy tag when the ignored
R25P artifacts are present. These reports are structural pilot analysis only
and must remain ignored local artifacts.
