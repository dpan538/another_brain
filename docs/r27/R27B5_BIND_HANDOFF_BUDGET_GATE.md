# R27B5 Bind Handoff Budget Gate

R27B5 binds the B4 static delivery rehearsal to an A-line browser candidate handoff when one exists, while keeping the full static bundle budget as the product-path gate. It does not admit a product model, does not commit assets, and does not add backend inference.

## Scope

- Discover A-line handoffs from `artifacts/r27a10`, `artifacts/r27a9b`, then `artifacts/r27a8b`.
- Fall back to the B2 synthetic candidate when no handoff exists.
- Measure candidate fit against the full static bundle, not model-only size.
- Keep candidate export, quantization, shards, and manifests in ignored `artifacts/` paths.
- Surface non-product candidate status in the static delivery config and UI.

## Candidate Routes

- `engineering export smoke candidate`: a checkpoint or synthetic fixture can be reconstructed, exported, quantized, sharded, and loaded for engineering verification only.
- `research-only candidate`: the candidate can be useful for analysis or smoke, but does not fit the full 100MB static product target.
- `product-path static candidate`: the candidate, tokenizer, shard overhead, manifest overhead, current app bundle, RAG assets, and safety margin fit under 100,000,000 bytes.
- `blocked candidate`: the candidate is missing, malformed, exceeds the budget by itself, or cannot pass same-origin/checksum checks.

## Current Local Result

No R27A10, R27A9B, or R27A8B handoff was present in this workspace during the R27B5 run, so the B5 budget gate classified the delivery route as `synthetic_only`.

The B2 export/load smoke path did find an ignored R27A7 checkpoint and exercised it as an engineering smoke candidate. That smoke does not change delivery mode, does not create a product model, and does not place assets in the static bundle.

## Non-Admission

R27B5 writes metadata only into tracked static config. It does not commit model weights, tokenizer artifacts, exported tensors, quantized shards, ONNX files, or browser model assets. Product-path status is gated by the full static bundle check and remains false unless the full projected static payload fits under the default 100MB target.
