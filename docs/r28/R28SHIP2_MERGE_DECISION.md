# R28SHIP2 Merge Decision

Decision label:

- `merge_ready`

Merge-ready evidence:

- q4 assets are the committed R28M1 static assets from `main`.
- q4 runtime exposes same-origin asset loading, exact tokenizer, non-blocking quick/deep self-check, and retry-before-fallback.
- final QA matrix passed 12/12; open questions do not hang.
- security prompt does not enter q4 and returns `malicious_evidence_ignored`.
- Chat UI is the default mode.
- Dashboard mode remains available.
- mobile loading markers, animation, progress, and cancel path pass LOAD0/UX5 tests.
- `npm run build` and `npm run build:vercel` pass.
- static budget/static-only/no-training/no-eval gates pass.
- no backend, external LLM API, Doubao, Vercel Function/Edge inference, or hosted vector store.
- no eval/old/private leak detected by the final gates.

Remaining blockers:

- product admission, browser admission, release checkpoint admission, and manual Vercel preview QA remain out of scope for this branch.
- These are not runtime P0 blockers for merge readiness.
