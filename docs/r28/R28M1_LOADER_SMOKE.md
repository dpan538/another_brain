# R28M1 Loader Smoke

`scripts/r28m1_loader_smoke.py` validates the committed static asset package without claiming browser inference readiness.

Checks:

- `asset_manifest.json` remains same-origin only.
- q4 shard paths are relative same-origin paths.
- q4 shard byte sizes match manifest declarations.
- q4 shard sha256 checksums match.
- `model.config.json` exists.
- `quantization.manifest.json` exists and declares q4.
- `tokenizer/tokenizer.json` exists.
- `checksums.sha256.json` covers the committed assets.

Expected result:

- `loader_smoke_passed=true`
- `inference_smoke_passed=false`
- `blocker=real_browser_inference_not_verified`

Current R28M1 smoke result:

- `loader_smoke_passed=true`
- `same_origin_paths=true`
- `sha256_verified=true`
- `shard_count=5`
- `tokenizer_present=true`
- `inference_smoke_passed=false`
- `blocker=real_browser_inference_not_verified`

R28M1 does not fake generation quality.
