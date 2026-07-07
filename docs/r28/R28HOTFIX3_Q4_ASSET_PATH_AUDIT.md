# R28HOTFIX3 q4 asset path audit

R28HOTFIX3 audits the production q4 asset path failure without training, changing model weights, or adding model assets.

The observed production blocker was:

- `asset_probe_failed:another_brain/model_assets/r28m1/shards/model-q4-00001.bin:0`
- `q4_forward_ran=false`
- `runtime_mode=synthetic_fallback`

The key finding is that the committed assets exist, but runtime self-check must not resolve manifest paths relative to the current page route. Browser fetches must use same-origin absolute public paths.

Required browser path normalization:

- `another_brain/model_assets/r28m1/shards/model-q4-00001.bin` -> `/another_brain/model_assets/r28m1/shards/model-q4-00001.bin`
- `web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin` -> `/another_brain/model_assets/r28m1/shards/model-q4-00001.bin`
- `./shards/model-q4-00001.bin` with base `/another_brain/model_assets/r28m1/` -> `/another_brain/model_assets/r28m1/shards/model-q4-00001.bin`

Audit command:

```bash
python3 scripts/r28hotfix3_q4_asset_path_audit.py
```

The audit writes a local report to `artifacts/r28hotfix3/reports/q4_asset_path_audit.json`. That report is not a release artifact and must not be committed.
