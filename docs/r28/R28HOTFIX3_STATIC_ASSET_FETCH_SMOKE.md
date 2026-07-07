# R28HOTFIX3 static asset fetch smoke

The static smoke emulates the production route `/another_brain_chat?message=你是谁` and verifies that q4 model assets resolve from same-origin public paths rather than route-relative paths.

Command:

```bash
python3 scripts/r28hotfix3_static_asset_fetch_smoke.py
```

Checks:

- `asset_manifest.json` resolves as `/another_brain/asset_manifest.json`.
- `quantization.manifest.json` resolves as `/another_brain/model_assets/r28m1/quantization.manifest.json`.
- The exact runtime tokenizer resolves as `/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`.
- All 5 q4 shards exist in the static output.
- Each q4 shard is non-empty and matches declared byte size.
- The runtime source no longer contains route-relative q4 shard probing.
- The self-check can move beyond quick asset checks into q4 forward smoke.

This smoke does not run training and does not add model assets.
