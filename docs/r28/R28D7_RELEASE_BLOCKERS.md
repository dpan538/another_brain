# R28D7 Release Blockers

R28D7 is preview-ready but admission-not-ready.

Open blockers:

- product model admission not done
- browser admission not done
- release checkpoint admission not done
- Vercel preview not checked
- manual preview QA not completed
- quality manual QA not completed
- runtime quality status remains `quality_not_ready`
- QA2 label remains `quality_weak`
- QA2 label remains `admission_not_ready`
- `phase_4=false`

Resolved preconditions:

- static q4 assets are present
- q4 shard checksums pass
- real q4 forward runs
- exact runtime tokenizer decode is primary
- readable q4 generation smoke passes
- deterministic generation policy is present
- answer-surface fallback/finalizer is present
- QA2 product-surface matrix passes
- static bundle remains under 100MB
- no backend or external model runtime is configured
- RAG sufficient, insufficient, conflict, and malicious-evidence checks pass
- adapter local-context path remains local-session-only and not training data

R28D7 is a final preview PR branch, not a release approval.
