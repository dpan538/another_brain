# R28HOTFIX2 Runtime Recovery

Self-check states must recover from all terminal conditions:

- `passed`
- `failed`
- `timeout`
- `cancelled`

The check button is re-enabled after completion, timeout, or cancellation. The stop button is disabled when no check is active. Message sending remains available while a deep self-check runs in its own Worker.

Generation timeouts terminate the active generation Worker so a stale q4 task does not keep consuming browser resources after fallback.
