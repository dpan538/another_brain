# R28D7 Release Blockers

R28D7 is preview-ready with a quality blocker. It is not release-ready.

## Open Blockers

- product model admission not done
- browser admission not done
- release checkpoint admission not done
- Vercel preview not checked
- manual preview QA not completed
- quality manual QA not completed
- runtime quality status remains `quality_not_ready`
- QA2 label is `preview_ready_with_quality_blocker`
- `phase_4=false`

## Resolved Preconditions

- static q4 assets are present
- q4 shard checksums pass
- real q4 forward runs
- exact runtime tokenizer decode is primary
- readable q4 generation smoke passes
- R28GEN1 deterministic generation policy is present
- answer-surface fallback/finalizer is present
- QA2 product-surface matrix passes
- static bundle remains under 100MB
- no backend or external model runtime is configured
- RAG sufficient, insufficient, conflict, and malicious-evidence checks pass
- adapter local-context path remains local-session-only and not training data

R28D7 is a final preview PR candidate, not a release approval.
