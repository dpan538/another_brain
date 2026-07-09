# R28HOTFIX2 Nonblocking Self-Check

R28HOTFIX2 changes the model path self-check from a single heavy check into two stages.

Quick check:
- Reads same-origin asset metadata.
- Checks q4 shard listing/probes.
- Checks runtime tokenizer metadata.
- Does not run q4 forward.
- Uses a short timeout and returns a visible status.

Deep check:
- Runs only after the visible self-check action.
- Uses a dedicated browser Worker.
- Runs a one-token q4 smoke with timeout.
- Can be cancelled with the visible stop button.
- Never blocks the message input or chat form.

If q4 forward is skipped, cancelled, timed out, or failed, the UI shows the blocker and keeps fallback available. It must not pretend that q4 generated the answer.
