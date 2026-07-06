# R27B2 Candidate Discovery

Discovery order is:

1. `artifacts/r27a9/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
2. `artifacts/r27a8/handoff/`
3. `artifacts/r27a7` reports, ledgers, and checkpoints
4. `artifacts/r27a6` reports, ledgers, and checkpoints
5. Synthetic tiny fallback

The discovery step does not require A9 to exist and does not modify A-line artifacts. If no usable handoff or ignored checkpoint is found, it reports `synthetic_fallback` with a blocker so the browser injection path can still be tested.

Discovery output is written to `artifacts/r27b2/manifests/candidate_discovery.json`.
