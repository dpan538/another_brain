# Checksums Instructions

Provide a `checksums.sha256` file inside the candidate inbox directory.

Each line should contain:

```text
<sha256>  <relative-file-name>
```

Rules:

- Use real sha256 values, not dummy hashes.
- Include tokenizer, config, metadata, runtime, and model shard files.
- Keep paths relative to the candidate directory.
- Do not include private local paths.
- Do not include remote URLs.
- Codex must not download remote weights to fill this file.
