# R27A7 MPS Device Throughput

- Python: `3.13.5`
- PyTorch: `2.12.0`
- MPS built: `True`
- MPS available: `False`
- CUDA available: `False`
- Selected probe device: `cpu`
- CPU fallback: `True`
- Fallback reason: `mps_unavailable_cuda_unavailable`
- Measured forward/backward candidates: `1`

Large CPU probes are skipped when MPS is unavailable to avoid repeated instability. This is a measured fallback, not a GPU claim.
