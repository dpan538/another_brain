# R27A8B Resource Guard And Slow Ramp

R27A8B is a resource-safe overnight engineering campaign. It reads the ignored A7R2 launch config at `artifacts/r27a7r2/go/R27A8B_READY.json` and refuses to train if READY is missing or a BLOCKED marker exists.

The resource guard applies `OMP_NUM_THREADS=2`, `MKL_NUM_THREADS=2`, `VECLIB_MAXIMUM_THREADS=2`, calls `torch.set_num_threads(2)` when available, checks disk headroom, writes a tiny metadata probe under ignored `artifacts/r27a8b/`, and keeps stdout clipped.

The slow ramp is required before normal segments:

- Stage -1 `micro_sanity`: 20 optimizer steps, tiny batch, no checkpoint.
- Stage 0 `warmup`: 100 optimizer steps, conservative LR.
- Stage 1 `controlled_segment`: 500 optimizer steps, evaluate before overnight.

Only after all ramp stages pass may the normal overnight segments run.
