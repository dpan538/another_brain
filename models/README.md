# Local Runtime Models

This directory tracks metadata for local runtime models.

The public app uses the tiny router Web SLM generated into `web/tiny_router_model.generated.js`. It does not require model weights, WebGPU, or cloud inference APIs.

Tracked files:

- `manifest.json`: tiny-router runtime metadata and public policy.

Ignored files:

- local training checkpoints
- local LoRA adapters
- any experimental model snapshots
