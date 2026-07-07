# R28D7 Final PR Instructions

R28D7 is the final preview PR branch after exact tokenizer recovery, deterministic generation hardening, and post-GEN1 product-surface QA.

## Manual PR

- base: `main`
- head: `r28d7-final-preview-branch`
- URL: `https://github.com/dpan538/another_brain/pull/new/r28d7-final-preview-branch`

## Integrated Base

- `origin/r28qa2-product-surface-qa`
- includes R28TOK1 exact runtime tokenizer
- includes R28GEN1 deterministic generation policy and finalizer hardening
- includes R28QA2 product-surface QA
- retains R28M1 same-origin q4 static assets

## Required Checks

```bash
npm run build
npm run build:vercel
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
python3 scripts/r28d7_final_preview_audit.py
python3 scripts/r28qa2_product_surface_matrix.py
git diff --check
git diff --cached --check
git show --check HEAD
```

## Current Preview Summary

- tokenizer status: `exact_runtime_tokenizer`
- runtime mode: `static_q4_experimental`
- q4 readable generation: passed with 40 smoke tokens across 5 prompts
- generation policy: R28GEN1 greedy deterministic policy present
- QA2 label: `preview_ready_with_quality_blocker`
- QA2 matrix: 14 pass, 0 fail
- deployable static bytes: 69,988,713
- 100MB margin: 30,011,287
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store

## Preview Validation

- Confirm Vercel preview is built from `r28d7-final-preview-branch`.
- Open `/another_brain_chat/`.
- Confirm local/static status and non-product warning are visible.
- Confirm runtime mode is `static_q4_experimental`.
- Confirm exact tokenizer status is visible in runtime/metadata status.
- Confirm generated q4 text can appear, with fallback reason shown when the finalizer blocks output.
- Confirm RAG sufficient, insufficient, conflict, and malicious evidence paths.
- Confirm adapter import remains local-session-only and not training data.
- Confirm network panel has no backend, external LLM, Doubao, or hosted vector store calls.

## Merge Discipline

- Do not merge main automatically.
- Do not approve product admission in this PR.
- Do not approve browser admission in this PR.
- Do not approve release checkpoint admission in this PR.
- Treat this branch as a Vercel preview candidate until preview validation and manual QA are completed.
