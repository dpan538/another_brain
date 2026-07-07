# R28STATUS0 Next Actions

Generated: `2026-07-07T14:53:58.444492+00:00`

## Shortest Launch Path

1. **R28HOTFIX2 preview verification**

   Why: Confirm nonblocking self-check, identity route answer, route trace, q4 status, and no console fatal errors in the deployed preview.

   Prompt: `R28HOTFIX2_PREVIEW_VERIFY — verify /, /another_brain_chat, /another_brain_chat?message=你是谁, self-check abort/timeout, and tokens_generated.`
2. **Merge hotfix only after preview passes**

   Why: main currently carries R28UX4; HOTFIX2 is the branch with the freeze/identity repair.

   Prompt: `R28HOTFIX2_MERGE_READINESS — no auto-merge; user confirms preview evidence before merge.`
3. **Production smoke after merge**

   Why: Production status is not live-checked by this local ledger.

   Prompt: `R28PROD_SMOKE0 — open production root and chat routes, click self-check, send 你是谁, verify q4/fallback status.`
4. **Admission work remains separate**

   Why: The current q4 path is an engineering candidate; product/browser/release admission is explicitly false.

   Prompt: `R28ADMISSION_NEXT — only after preview/prod smoke passes; do not approve admission inside status/audit tasks.`

## Guardrails

- Do not train.
- Do not add or change model weights/shards.
- Do not parse root DOCX/PDF or `data/public_ingestion`.
- Do not connect backend inference, external LLM APIs, Doubao, or hosted vector stores.
- Do not approve product/browser/release admission inside a status task.
