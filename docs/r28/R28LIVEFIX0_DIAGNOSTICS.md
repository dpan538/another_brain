# R28LIVEFIX0 Diagnostics

Manual browser command:

```js
await window.__anotherBrainDiagnostics()
```

Expected shape:

```json
{
  "branch_marker": "R28LIVEFIX0",
  "branch_name": "r28livefix0-live-q4-mount",
  "runtime_mode": "static_q4_experimental",
  "asset_manifest": {"ok": true, "status": 200},
  "q4_shards": [
    {
      "path": "another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
      "normalized_url": "https://preview.example/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
      "ok": true,
      "status": 206,
      "bytes_read": 16,
      "probe_strategy": "get_range_then_get_body"
    }
  ],
  "tokenizer": {"ok": true},
  "q4_forward": {
    "attempted": true,
    "ok": true,
    "q4_forward_ran": true,
    "tokens_generated": 1,
    "blocker": ""
  },
  "answer_source": "static_q4_experimental",
  "merge_runtime_ready": true
}
```

`merge_runtime_ready` is true only when:

- manifest fetch passes.
- exactly five q4 shard probes pass with `bytes_read > 0`.
- exact tokenizer passes.
- q4 forward runs and generates at least one token.
