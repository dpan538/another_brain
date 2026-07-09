# R28LIVEFIX0 Asset Probe Fix

Root cause found:

- SHIP2's browser probe mixed HEAD and Range GET.
- The report converted missing `content-length` to `0`.
- Live static hosts can omit `content-length` for `.bin` responses or answer Range requests as 200.
- That made a readable shard look like `asset_probe_failed:...:0`.

Probe contract:

```json
{
  "requested_path": "another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
  "normalized_url": "https://preview.example/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
  "method": "GET_RANGE",
  "status": 206,
  "content_length_header": "",
  "bytes_read": 16,
  "ok": true,
  "failure_reason": ""
}
```

Allowed pass cases:

- `206` plus `bytes_read > 0`.
- `200` plus `bytes_read > 0` when Range is unsupported.

Rejected cases:

- external URLs.
- path traversal.
- artifact paths.
- `data/public_ingestion`.
- `ok=false`.
- `bytes_read=0`.
