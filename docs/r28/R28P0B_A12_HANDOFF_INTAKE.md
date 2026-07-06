# R28P0B A12 Handoff Intake

The intake script reads the A12 browser handoff in priority order:

1. `artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
2. `data/training_registry/r27a12_browser_handoff_summary.json`
3. fallback to `no_model`

In this worktree, the A-line artifacts are read-only and remain ignored. R28P0B does not merge the A-line branch.

Observed A12 intake result:

- status: `product_path_engineering_candidate`
- selected model: `new_96m`
- optimizer tokens: `10240000`
- full static bundle estimate: `98385593` bytes
- budget classification: `product_path_tight`
- safety guard: clean
- dialogue readiness: candidate

If A12 is still running, the intake status becomes `WAIT_A12_RUNNING` and the integration must stop.
