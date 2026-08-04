# R29B1 isolated Torch recovery contract

R29B1 starts by proving an approved, native arm64 PyTorch environment before it
opens a checkpoint or evaluates a model. It retains R29B0 as blocked evidence:
its tiny `ReferenceDecoder` fixture is not evidence about the real 96M model.

The supervisor is a single foreground process. It atomically records its phase,
heartbeat, active child command and PID in an ignored artifact root. Native
imports run only in independent subprocesses with faulthandler and a timeout,
so a binary failure cannot take down the supervisor.

The approved matrix is deliberately narrow:

- Primary: arm64 CPython 3.12 with official PyTorch 2.13.0 binary wheels.
- Fallback, only after a reproducible primary native validation failure: arm64
  CPython 3.11 with official PyTorch 2.12.0 binary wheels.

All runtime and test wheels are downloaded first, checksummed in the ignored
wheelhouse, and installed with binary-only offline resolution. The PyTorch 2.12
wheel metadata constrains `setuptools` below 82; the bootstrap therefore
preserves that constraint rather than allowing a newer unrelated wheel to make
the fallback look like a native PyTorch failure.

No checkpoint, corpus, weights, optimiser state or browser asset is committed
by this recovery step. Until an environment completes repeated import and CPU
smoke validation, training remains disabled and all optimizer counters remain
zero.
