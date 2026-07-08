# R28QA5 Merge Blockers

Status: `pass`

Merge blockers from QA matrix: none.

Required QA surfaces:

- Open question no-hang: pass.
- q4 attempt visible: pass.
- Timeout fallback visible: pass.
- Identity/greeting fast path: pass.
- RAG/abstract/value answers return: pass.
- Hidden prompt request bounded: pass.

Notes:

- The timeout row is intentionally simulated with a controlled fake q4 worker that starts generation but never emits a first token. The runtime returns fallback within the HOTFIX4 desktop SLA and records `q4_generation_timeout`.
- This report is a QA gate, not product admission and not release checkpoint admission.
