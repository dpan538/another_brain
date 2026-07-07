# R28UX2 Chinese-First Copy

R28UX2 changes the static chat shell copy to Chinese-first language for the demo surface while preserving technical route names where they are part of the contract.

## Required user-facing markers

- 本地静态运行
- 无后端 / 无外部 LLM
- prelaunch engineering candidate
- 不是 product model
- 没有 admission
- 没有接入真实模型资产时，使用 synthetic / fallback 路径
- 导入上下文仅本地 session 使用
- 导入上下文不会进入训练
- evidence panel 是辅助证据，不是 answer bank

## Kept technical route names

The UI keeps these exact route names because tests, docs, and handoff language use them as stable contract markers:

- `synthetic_demo`
- `metadata_bound_candidate`
- `product_path_candidate_not_admitted`

## Copy surfaces

- Header and badges explain local static operation.
- Delivery strip explains model mode, RAG mode, budget, route, handoff, adapter, and blockers.
- Context bridge explains session-only import and non-training behavior.
- Message toolbar explains current answer state and fallback status.
- Evidence drawer explains support-only evidence and guard behavior.
- Composer placeholder is Chinese-first and includes keyboard submit guidance.

## Intentional wording

The shell avoids product-style claims. It uses candidate, fallback, synthetic, local session, and static-shell language so the demo reads clearly without implying model admission or production readiness.
