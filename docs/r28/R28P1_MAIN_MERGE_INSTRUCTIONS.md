# R28P1 Main Merge Instructions

Recommended PR target: `main`.

Source branch:

```text
r28p1-release-candidate-gate
```

Before merge, confirm:

- Local R28P1 release-candidate gate passes.
- `npm run build` passes.
- `npm run build:vercel` passes.
- Static-only and budget checks pass.
- Vercel preview deployment passes from the PR URL.
- No model weights, tokenizer artifacts, exported shards, quantized files, ONNX, GGUF, root DOCX/PDF, or `data/public_ingestion` files are added.
- PR description states that this is `demo_static_with_engineering_candidate_metadata`.

Merge recommendation:

Merge to `main` only as a prelaunch demo package after the Vercel preview is verified. Do not mark product model admission, browser admission, release checkpoint admission, or Phase 4 as complete in the PR.
