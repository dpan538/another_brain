# R29B1 terminal report

Campaign `r29b1_torch_reference_q4_recovery_v1` reached
`BLOCKED_WITH_EVIDENCE` during environment validation.

Both approved, isolated arm64 environments completed binary-only installation
from their audited wheelhouses. Each then ran five independent `torch` import
probes with faulthandler and a fixed timeout. Every probe timed out without a
clean import, exit code or native diagnostic report. CPU and MPS smoke tests
were consequently skipped: a reference cannot safely use a runtime which has
not imported successfully.

This is an environment gate result, not a model-quality result. R29B1 did not
open a checkpoint, execute FP32 reference inference, inspect q4 weights, build
a KV cache, evaluate q4 v2, or start training. Optimizer and assistant-target
token counters remain zero. R29B0 remains blocked evidence; its tiny fixture
was neither rerun nor counted as evidence about the actual 96M architecture.

The ignored campaign state, heartbeat, wheel checksums, per-environment
installation manifests and independent validation reports contain the precise
machine-local evidence. No wheel, environment, artifact, checkpoint, model
weight, corpus or production asset is committed by this result.
