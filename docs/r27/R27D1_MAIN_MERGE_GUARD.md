# R27D1 main merge guard

Use this checklist before merging the deployment integration branch to `main`.

## Required before merge

1. D1 branch preview deployment passes, or the Vercel build log proves a non-repo cause.
2. Bundle is under 100MB.
3. No model assets are committed.
4. No tokenizer artifacts are committed.
5. No exported or quantized shards are committed.
6. No backend inference is attached.
7. No Vercel Function or Edge inference is attached.
8. No external LLM API, Doubao endpoint, or hosted vector store is attached.
9. No training runs in `npm run build`, `npm run build:vercel`, or routine gates.
10. No `artifacts/` payloads are tracked except allowed placeholders.
11. No A-line worktree files are pulled into the deployment branch.
12. No root DOCX/PDF files are parsed or committed.
13. No `data/public_ingestion` files are parsed or committed.
14. Static chat route passes.
15. RAG demo asset is declared and remains same-origin/static-only.

## Current D1 status

- Bundle: `22,202,171` bytes, below the `100,000,000` byte budget.
- Output directory: `web`
- Static route checks:
  - `/`: PASS
  - `/another_brain_chat/`: PASS
  - `/another_brain_chat/browser_runtime.js`: PASS
- RAG demo asset: declared at `another_brain/static_rag/demo_memory.json`, `2,065` bytes, demo-only, not answer-bank.
- Declared model bytes: `0`
- Declared tokenizer bytes: `0`
- Backend inference: absent
- External LLM API: absent
- Doubao: absent
- Hosted vector store: absent
- Tracked forbidden artifact failures: none
- Active training/tokenizer/corpus/product/weight/phase4 approvals: `0`
- `vercel` CLI: unavailable locally, so `vercel build` was not run.
- `gh` CLI: unavailable locally, so PR existence was not confirmed locally.

## Merge recommendation

If the D1 preview deployment passes, merge the D1 deployment integration branch to `main`.

If the D1 preview deployment fails, do not guess from the Gmail screenshot. Use the Vercel Deployment Details build log to patch the first failing command or correct project settings. Re-run local D1 readiness and preview deployment before merging.

Do not merge raw B5 directly into `main` if that path brings A-line training artifacts, training registries, training approvals, weights, tokenizers, corpus payloads, or artifacts into the production branch.

## Non-claims

This guard does not approve phase 4, product model admission, backend inference, external LLM API use, Doubao integration, hosted vector storage, model weight commits, tokenizer artifact commits, root DOCX/PDF parsing, or `data/public_ingestion` parsing.
