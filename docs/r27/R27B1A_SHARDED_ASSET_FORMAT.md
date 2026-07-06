# R27B1A Sharded Asset Format

The custom static shard experiment writes ignored local files under `artifacts/r27b1a/shards/`.

Format:

- `config.json`
- `quantization.json`
- `tensor-00000.bin`, `tensor-00001.bin`, and so on
- `shard_manifest.json`

Manifest fields include schema version, same-origin-only flags, config digest, quantization digest, tensor shard relative paths, bytes, SHA-256 hashes, and total shard bytes.

Paths are same-origin relative paths only. The format is experimental and not a browser admission.
