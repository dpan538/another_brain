# R28MERGE1 Final Preview And Merge Gate

R28MERGE1 is a final local preview gate. It does not train, modify q4 shards, call a backend, call an external LLM API, call Doubao, use a hosted vector store, approve product admission, approve browser admission, approve release checkpoint admission, or merge main automatically.

## Selected Base

`origin/r28ux5-chat-dashboard-split`

## Output Enum

The gate reports exactly one of:

- `merge_ready`
- `preview_ready_not_merge_ready`
- `blocked_runtime`
- `blocked_ui`
- `blocked_budget`

## Current Gate Decision

`preview_ready_not_merge_ready`

The preview passed local runtime, UI, budget, q4 asset, tokenizer, self-check, route, and non-claim checks. It remains not merge-ready because the runtime still declares pre-release blockers:

- product model admission not done
- browser admission not done
- release checkpoint admission not done
- Vercel preview not checked
- quality manual QA not done
- phase 4 false

This is deliberate: MERGE1 creates a final PR candidate and a blocker ledger, not a release or product admission.

## Local Evidence Snapshot

- q4 assets admitted: yes, 5 q4 shards, `48,267,968` model asset bytes.
- q4 forward status: pass from `r28stab0_runtime_soak_report`, `4` generated tokens in real static q4 smoke.
- exact tokenizer: pass, `exact_runtime_tokenizer`.
- self-check nonblocking: pass.
- identity route fast: pass, max `3.695 ms` in MERGE1 gate run.
- greeting route fast: pass, max `9.872 ms` in MERGE1 gate run.
- UI mobile/desktop smoke: pass, Chat Mode default and Dashboard toggle visible.
- static bundle: `70,152,623` bytes, `29,847,377` bytes under the 100MB cap.
- output: `preview_ready_not_merge_ready`.
- auto merge: false.

## Required Validation

- `npm run test:r28merge1`
- `npm run test:r28ux5`
- `npm run test:r28stab0`
- `python3 scripts/r28stab0_static_route_matrix.py`
- `python3 scripts/r28stab0_runtime_soak.py`
- `python3 scripts/r28d8_assert_static_llm_assets_admitted.py`
- `npm run test:r28d8`
- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`
- `npm run check:no-training-in-routine-gates`
- `npm run check:training-approval-markers`
- `git diff --check`
- `git diff --cached --check`
- `git show --check HEAD`

## Non-Claims

- not product model
- not product admission
- not browser admission
- not release checkpoint
- no training
- no changed q4 shards
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
