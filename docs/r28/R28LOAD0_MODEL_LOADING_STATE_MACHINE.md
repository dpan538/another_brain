# R28LOAD0 Model Loading State Machine

R28LOAD0 separates browser model loading from chat generation with a finite state machine. The state is exposed as `loading_state` on model self-check progress reports, final self-check reports, and chat runtime packets.

## States

- `idle`
- `checking_manifest`
- `checking_shards`
- `checking_tokenizer`
- `warming_q4`
- `q4_ready`
- `fallback_ready`
- `timeout`
- `cancelled`
- `failed`

## Schema

```json
{
  "state": "checking_manifest",
  "manifest": "pending",
  "shards": "pending",
  "tokenizer": "pending",
  "q4_forward": "pending",
  "q4_forward_ran": false,
  "tokens_generated": 0,
  "decode_status": "not_run",
  "runtime_mode": "synthetic_fallback",
  "blocker": null,
  "elapsed_ms": 0,
  "cancelable": true
}
```

`q4_ready` is only emitted after q4 warmup runs in the browser worker and generates at least one token. Quick metadata checks can confirm manifest, shard URLs, and tokenizer availability, but they do not mark q4 ready.

## Blockers

- `q4_shards_unavailable`: manifest has no q4 shards or shard probes fail. The dashboard exposes normalized failing shard paths.
- `exact_runtime_tokenizer_unavailable`: tokenizer manifest or runtime compatibility is not confirmed.
- `q4_forward_timeout`: q4 warmup exceeded the deep-check timeout.
- `q4_forward_not_confirmed`: deep check finished without a token.
- `model_loading_cancelled` / `self_check_cancelled`: user cancelled loading.
