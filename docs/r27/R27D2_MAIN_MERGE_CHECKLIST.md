# R27D2 main merge checklist

Use this checklist before merging the deployment branch to `main`.

## Required checks

1. PR exists with base `main` and head `r27d1-preview-deploy-readiness`.
2. Vercel preview deployment for the PR passes, or Build Logs prove a non-repo cause and the branch/project setting has been corrected.
3. `npm run build` passes.
4. `npm run build:vercel` passes.
5. Bundle is under 100MB.
6. `npm run check:r27b0-static-budget` passes.
7. `npm run check:r27b0-static-only` passes.
8. Static route checks pass for `/`, `/another_brain_chat/`, and `/another_brain_chat/browser_runtime.js`.
9. No backend inference is attached.
10. No Vercel Function or Edge inference is attached.
11. No external LLM API or Doubao wiring is attached.
12. No hosted vector store is attached.
13. No model weights are committed.
14. No tokenizer artifacts are committed except the existing tiny fixture tokenizer.
15. No exported or quantized shards are committed.
16. No `artifacts/` payloads are tracked except allowed placeholders.
17. No root DOCX/PDF files are committed or parsed.
18. No `data/public_ingestion` files are committed or parsed.
19. No A12 or A-line worktree files are merged into the deployment branch.
20. No training runs in `npm run build`, `npm run build:vercel`, or routine gates.

## Local guard command

Run:

```sh
python3 scripts/r27d2_main_merge_guard.py
```

The guard checks the D1 readiness audit and runs:

- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`

## Merge recommendation

If the PR preview passes and all local D2 checks pass, merge the deployment branch into `main`.

If the preview fails, use `docs/r27/R27D2_VERCEL_LOG_CAPTURE_TEMPLATE.md` to capture the first failing command and patch from evidence. Do not guess from the Gmail notification and do not merge raw B5.

## Non-claims

This checklist does not approve training, phase 4, product model admission, backend inference, external LLM API use, Doubao integration, hosted vector storage, model weight commits, tokenizer artifact commits, root DOCX/PDF parsing, or `data/public_ingestion` parsing.
