# R27B1A Model Export Quantization

R27B1A adds an experimental pipeline from ignored local checkpoint metadata to browser static candidate manifests.

Committed code paths:

- `scripts/r27b1a_inspect_checkpoint_for_export.py`
- `scripts/r27b1a_export_candidate.py`
- `scripts/r27b1a_quantize_candidate.py`
- `scripts/r27b1a_write_static_shards.py`
- `scripts/r27b1a_export_onnx_exploratory.py`
- `src/browser_export/`

All generated export, quantization, shard, and ONNX outputs are local ignored artifacts under `artifacts/r27b1a/`.

R27B1A does not admit a browser model and does not commit weights, tokenizer artifacts, exported assets, quantized assets, shards, or ONNX files.
