# R28HOTFIX2 Self-Check Audit

`scripts/r28hotfix2_selfcheck_audit.py` checks the production freeze fix for the model path self-check.

It verifies:

- the visible self-check button binding
- the visible stop button binding
- quick check on boot
- deep check through a dedicated Worker
- timeout and abort markers
- progress reporting
- recovery from pending state
- no UI input locking
- no 120 second self-check timeout
- identity route marker

The JSON report is written to `artifacts/r28hotfix2/reports/selfcheck_audit.json` and is not tracked.
