# R28LIVEFIX0 Live Q4 Mount

R28LIVEFIX0 targets the live-preview q4 mount mismatch where local gates passed but the browser preview showed:

- q4 forward false.
- fallback runtime.
- `asset_probe_failed:/another_brain/model_assets/r28m1/shards/model-q4-00001.bin:0`.

Correction:

- q4 shard proof now uses GET with `Range: bytes=0-15`.
- A 206 response passes only when body bytes are read.
- A 200 response also passes when Range is unsupported but body bytes are read.
- HEAD and `content-length` are not accepted as the only proof.
- Missing `content-length` is not a failure.
- `content-length=0` is not a failure when GET body bytes are present.

State correction:

- assets pass requires all five q4 shard probes to read bytes.
- tokenizer pass requires exact runtime tokenizer confirmation.
- q4 warmup runs only after assets and tokenizer pass.
- if warmup times out, blocker is `q4_forward_timeout`, not `asset_probe_failed`.
- if warmup is not confirmed, blocker is `q4_forward_not_confirmed`.
