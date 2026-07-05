# R27B1A ONNX Exploratory Path

R27B1A includes `scripts/r27b1a_export_onnx_exploratory.py` as an exploratory ONNX path.

Current status:

- ONNX export is attempted as a report-only path.
- No ONNX artifact is committed.
- No ONNX artifact is assumed to be the final runtime.
- A future ONNX export needs a defined `torch.nn.Module` reconstruction path for the selected checkpoint family.

Any generated `.onnx` file must remain ignored under `artifacts/r27b1a/exported_model/`.
