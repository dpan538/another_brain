# R28HOTFIX4 Generation Watchdog

The browser runtime now records generation lifecycle fields:

- `q4_attempted`
- `generation_started`
- `generation_finished`
- `generation_status`
- `tokens_generated`
- `first_token_ms`
- `total_generation_ms`
- `answer_source`
- `fallback_reason`

The watchdog has three timers: worker start, first token, and max total generation. Timeout, worker error, and abort all terminate the request and update the public process trace. The UI must not remain pending forever.
