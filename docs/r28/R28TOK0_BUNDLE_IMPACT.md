# R28TOK0 Bundle Impact

R28TOK0 adds a small same-origin runtime tokenizer asset and keeps the deployable static bundle under the 100MB gate.

## Added Runtime Asset

- Runtime tokenizer path: `web/another_brain/model_assets/r28m1/tokenizer/runtime_tokenizer.json`
- Runtime tokenizer bytes: `997419`
- Total tokenizer asset bytes: `998357`

## Bundle Gate

- Full deployable static bytes: `69982673`
- Max allowed static bytes: `100000000`
- Margin: `30017327`
- Max shard size remains: `12000000`
- Model shard count remains: `5`

## Asset Safety

R28TOK0 does not add model weights or shards. The only new model-adjacent asset is the runtime tokenizer JSON required for same-origin browser encode/decode.

No `artifacts/`, raw checkpoints, training corpora, `data/public_ingestion`, root DOCX/PDF, ONNX, GGUF, or tokenizer training artifacts are admitted by this step.
