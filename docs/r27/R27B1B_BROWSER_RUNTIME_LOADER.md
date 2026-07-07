# R27B1B Browser Runtime Loader

R27B1B adds a browser runtime abstraction in `src/browser_runtime/` with these modes:

- `mock`
- `synthetic_tiny`
- `static_shard_manifest_experimental`
- `onnx_webgpu_experimental`
- `wasm_fallback_experimental`

Default runtime remains `synthetic_tiny`, not a product model. The static shard manifest loader accepts same-origin manifests only, requires budget metadata, rejects external or private artifact paths, and verifies SHA-256 when a shard digest is declared.
