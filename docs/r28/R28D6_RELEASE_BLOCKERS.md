# R28D6 Release Blockers

Open blockers carried into R28D6:

- `not_ready_quality_blocked`
- `not_ready_preview_blocked`
- product model admission not done
- browser admission not done
- release checkpoint admission not done
- Vercel preview not checked
- manual preview QA not completed
- quality manual QA not completed
- exact runtime tokenizer vocabulary remains missing
- `phase_4=false`

Resolved preconditions:

- model assets committed
- q4 shard checksums pass
- real q4 forward runs
- readable display-codec decode works
- QA matrix passes
- static bundle remains under 100MB
- no backend or external model runtime is configured
- RAG honesty checks pass
- safety guard checks pass

R28D6 is a merge candidate for preview review, not a release approval.
