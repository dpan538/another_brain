# R27B2 Browser Loader Smoke

`scripts/r27b2_browser_loader_smoke.py` loads the ignored candidate static manifest, rejects non-same-origin shard paths, verifies total budget, checks shard sizes and SHA-256 hashes, and records a synthetic generation fallback.

The smoke does not require product-quality generation. If a future static shard matmul runtime is available, it can be added here as a tiny forward pass, but R27B2 keeps the committed route model-free.

Smoke output is written to `artifacts/r27b2/manifests/browser_loader_smoke.json`.
