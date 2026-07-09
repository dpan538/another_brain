# Local Runtime Models

The current public runtime model is the R28M1 q4 browser package committed under:

```text
web/another_brain/model_assets/r28m1/
```

It is loaded from same-origin static assets in the browser. The runtime uses the
committed manifest, five q4 shards, exact runtime tokenizer, checksum checks,
and q4 forward warmup diagnostics.

The committed R28M1 q4 browser model package is licensed under MIT; see
`MODEL_LICENSE.md`.

Ignored model-related files remain outside the public runtime and outside the
model license scope:

- raw checkpoints
- LoRA adapters
- tokenizer training artifacts
- raw/clean/processed corpus files
- private local memory or private source material
