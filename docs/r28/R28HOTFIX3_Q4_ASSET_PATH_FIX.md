# R28HOTFIX3 q4 asset path fix

R28HOTFIX3 fixes production q4 asset activation by normalizing model asset paths before browser fetch.

What changed:

- Added a runtime asset path normalizer for browser public paths.
- Mapped `web/another_brain/...` to deployed `/another_brain/...`.
- Mapped manifest paths such as `another_brain/...` to same-origin absolute paths.
- Rejected external URLs, path traversal, `artifacts/`, and `data/public_ingestion`.
- Updated self-check shard probing to report normalized failing paths.
- Updated q4 worker fetch logic to use the same public-path rules.
- Updated UI/cache version markers to `R28HOTFIX3`.

Expected result:

- `/another_brain/model_assets/r28m1/quantization.manifest.json` is the browser manifest URL.
- `/another_brain/model_assets/r28m1/shards/model-q4-00001.bin` through `model-q4-00005.bin` are the browser shard URLs.
- q4 shard quick-check should pass when these committed files are served.
- If q4 forward fails after that, the blocker should be a forward/runtime blocker, not `asset_probe_failed`.

This is still an engineering preview path. It does not claim product model admission, browser admission, or release checkpoint admission.
