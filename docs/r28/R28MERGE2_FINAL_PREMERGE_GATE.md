# R28MERGE2 Final Pre-Merge Gate

R28MERGE2 creates a final PR candidate after loading, UX, natural answer surfaces, and profile RAG stabilization.

It does not train and does not automatically merge.

## Selected Base

Priority order:

1. `r28rag3-lightweight-profile-rag`
2. `r28surf3-anchor-natural-surfaces`
3. `r28ux6-minimal-chat-dashboard`
4. `r28load0-model-loading-state-machine`
5. `r28hotfix2-nonblocking-selfcheck`

Selected base:

- `origin/r28rag3-lightweight-profile-rag`

## Gate Script

- `scripts/r28merge2_final_premerge_gate.py`
- `npm run test:r28merge2`

The gate emits one of:

- `merge_ready`
- `preview_ready_not_merge_ready`
- `blocked_runtime`
- `blocked_ui`
- `blocked_budget`
- `blocked_quality`

## Current Expected Label

The current branch is expected to report:

- `preview_ready_not_merge_ready`

Reason: runtime, UI, static budget, static-only, tokenizer, q4 asset, q4 forward metadata, nonblocking self-check, micro-intent routes, and source visibility are ready for preview; release blockers are still visible and quality is still marked not ready.

## Merge Decision

- `can_preview: true`
- `can_merge: false`
- `merge_decision: do_not_merge`

Visible blockers include product model admission, browser admission, release checkpoint admission, Vercel preview, manual QA, and phase 4 status.

## Required Evidence Commands

- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`
- `npm run check:no-training-in-routine-gates`
- `npm run check:training-approval-markers`
- `node scripts/r28tok1_node_q4_readable_smoke.mjs`
- `npm run test:r28load0`
- `npm run test:r28ux6`
- `npm run test:r28surf3`
- `npm run test:r28rag3`
- `npm run test:r28merge2`

## Non-Claims

- no training
- no model asset changes
- no q4 shard changes
- no root DOCX/PDF parsing
- no `data/public_ingestion` parsing
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
- no product admission
- no browser admission
- no release checkpoint admission
- no automatic merge
