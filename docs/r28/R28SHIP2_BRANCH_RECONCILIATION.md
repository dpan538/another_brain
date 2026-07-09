# R28SHIP2 Branch Reconciliation

Final branch:

- `r28ship2-final-launch-candidate`

Integration strategy:

- Start from `origin/main`.
- Squash the QA6 lineage as the runtime/UI/answer base.
- Selectively transplant LOAD0 state-machine files, tests, and docs.
- Apply a final R28SHIP2 correction for answer-surface category isolation and prompt-injection early boundary handling.
- Preserve QA6/SHIP0 q4 runtime wiring and UX5 Chat/Dashboard split.
- Do not merge A13 assets, checkpoints, or claims.

Integrated capability lineage:

- q4 assets: `origin/main` committed R28M1 assets.
- exact tokenizer: `origin/main` / TOK1 runtime tokenizer assets.
- path/runtime/self-check/retry: HOTFIX1/HOTFIX2/HOTFIX3/SHIP0 lineage via QA6.
- open-question no-hang: HOTFIX4 plus QA6.
- answer surfaces: SURF5 via QA6.
- Chat/Dashboard UI: UX5/SHIP0 preserved via QA6.
- loading state: selected LOAD0 module and mobile markers.
- RAG/profile: static local profile pack, no hosted vector store.
- final QA: R28SHIP2 matrix treats QA6 merge blockers as hard failures.

Not integrated:

- A13 model replacement.
- new model weights or q4 shards.
- backend, Edge, Function, hosted vector store, external LLM, or Doubao runtime.
