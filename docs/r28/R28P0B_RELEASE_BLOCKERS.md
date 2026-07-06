# R28P0B Release Blockers

R28P0B is PR-ready for prelaunch preview, but it is not release-ready.

Current blockers:

- Vercel preview has not been checked from a deployed URL.
- Product admission has not been done.
- Browser admission has not been done.
- Release checkpoint admission has not been done.

Conditional blockers:

- If no candidate handoff is available, the branch remains a D3 static shell with `no_model`.
- If the candidate is `not_ready`, the handoff route must be `product_path_not_ready` or `no_go_not_ready`.
- If the full static bundle estimate exceeds 100MB, the route must be `no_go_budget` or research-only.

R28P0B intentionally does not clear these blockers.
