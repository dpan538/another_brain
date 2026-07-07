# R27B1C Asset Packaging Policy

R27B1C keeps the deployable default asset set static-only and model-free. The committed `web/another_brain/asset_manifest.json` remains the same-origin manifest of record and declares zero model or tokenizer bytes by default.

Candidate model injection is allowed only after a separate admission decision. The source must be a local ignored artifact, the copy must happen at build time, and the source must never be a raw training checkpoint copied directly into `web/`.

Any candidate model package must include a model asset manifest, SHA-256 for every shard, a quantization manifest, a tokenizer manifest, source lineage metadata, and a `non_product` flag unless explicit product admission has occurred. The package must fit the 100MB static target and keep model, tokenizer, runtime shell, RAG, and gate budgets visible.

R27B1C does not commit weights, tokenizer artifacts, exported assets, ONNX files, or quantized shards.
