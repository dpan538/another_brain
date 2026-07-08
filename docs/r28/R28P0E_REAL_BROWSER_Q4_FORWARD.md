# R28P0E Real Browser q4 Forward

R28P0E fixes the P0 gap where the dashboard could show q4 loading state while the real chat answer path still produced `tokens_generated=0` or fell back without proving q4 participation.

## Root Cause

- Boot-time q4 mount/self-check and chat generation reused the same runtime worker.
- A user could submit an open question while the boot self-check was still running.
- Both paths assigned `worker.onmessage`, creating a race where self-check looked active but chat could still end with `q4_forward_ran=false`.
- Existing browser checks covered cold start and compatibility, but did not require a real chat submission to produce q4 tokens.

## Runtime Fix

- Non-micro chat questions now call `waitForQ4MountBeforeDraft()` before `draftWithWorker()`.
- If a q4 mount is already in progress, chat waits for the existing `activeQ4MountPromise` instead of taking over the worker.
- If q4 mount fails, the answer can fall back only with a visible blocker.
- Micro intent surfaces, such as greetings and identity, can still answer quickly without pretending to use q4.
- The user-facing loading screen no longer exposes a fast/lightweight chat escape hatch. Chat input and Send stay disabled until the q4 mount is fully ready.

## UI Contract

- Chat is fixed to one viewport with no page-level vertical scroll.
- The conversation card and input card use a 3:1 grid ratio on desktop and mobile.
- The user-facing palette is solid poster-style color only; no CSS gradients are used.
- Dashboard keeps diagnostics but adds a compact q4 path line chart for manifest, shards, tokenizer, q4 forward, and generated tokens.

## Truth Contract

For open chat questions in the P0E browser smoke:

- `q4_status` must reach `ready`.
- self-check must show `q4_forward_ran=true`.
- chat draft trace must show `q4_forward_ran=true`.
- chat draft trace must show `tokens > 0`.
- runtime truth table must pass.
- answer source must not be `no_model_fallback`.

If q4 emits unusable text, the verifier may replace it with a boundary answer, but the dashboard must still show q4 token evidence and the quality blocker.

## Evidence

Local P0E browser smoke output is written to:

`artifacts/r28p0e/reports/browser_q4_answer_smoke.json`

Latest local run:

- `desktop_real_q4_answer`: q4 ready, `tokens=8`, `truth=pass`.
- `mobile_real_q4_answer`: q4 ready, `tokens=8`, `truth=pass`.
- `mobile_throttled_real_q4_answer`: q4 ready, `tokens=8`, `truth=pass`.

## Non-Claims

- not product admission
- not browser admission
- not release checkpoint
- no training
- no new model assets
- no backend inference
- no external LLM API
- no Doubao
- no hosted vector store
