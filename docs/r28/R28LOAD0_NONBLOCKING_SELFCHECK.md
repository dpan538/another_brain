# R28LOAD0 Nonblocking Self-Check

R28LOAD0 keeps chat usable while model checks run.

## Timing

- Quick check uses a 1 second ceiling for manifest/tokenizer/shard path probes.
- Deep q4 warmup defaults to 8 seconds.
- Deep q4 warmup is capped at 15 seconds.

## Behavior

- Deep q4 warmup runs through `self_check_worker.js`.
- Progress reports include `loading_state`.
- Repeated loading requests reuse or cancel the active check path instead of allowing multiple heavy checks to accumulate.
- User cancellation aborts the active self-check controller and returns the UI to fallback mode.
- Self-check failure never disables chat; sends call `runtime.run(runtimeInput)` and do not wait for quick/deep self-check completion.

## Recovery

- q4 timeout reports `loading_state.state=timeout`, `q4_forward=timeout`, and `blocker=q4_forward_timeout`.
- Missing shards report `blocker=q4_shards_unavailable` with normalized failing paths in the dashboard.
- q4 success reports `loading_state.state=q4_ready`, `runtime_mode=static_q4_experimental`, `q4_forward_ran=true`, and `tokens_generated>=1`.
