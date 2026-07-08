# R28STAB0 Stability Soak

R28STAB0 is a local static stability gate for the R28 runtime line. It is intentionally pre-merge and pre-admission.

## Route Matrix

Routes covered:

- `/`
- `/another_brain_chat`
- `/another_brain_chat/`
- `/another_brain_chat?message=你好`
- `/another_brain_chat/?message=你是谁`
- `/another_brain_chat?message=你从哪里来`
- `/another_brain_chat?message=你是鳄鱼吗`

Each route must resolve to a direct static entry, avoid redirect loops, expose the process panel, show q4/tokenizer/self-check status, and preserve mobile/desktop viewport readiness.

## Soak Scenarios

- Initial load uses quick self-check only.
- Manual "检查本地模型路径" starts deep self-check.
- "停止检查" aborts deep self-check and restores controls.
- A second manual self-check can start after cancellation.
- Repeated sends are serialized by the UI `running` guard.
- Identity, greeting, origin, and crocodile routes use micro-intent fast paths.
- Insufficient, conflicting, malicious, timeout, shard failure, and tokenizer-missing paths keep deterministic fallback recovery.
- q4 forward is validated through committed static q4 assets using local file-backed Node smoke, not backend inference.

## Stability Criteria

The local soak is green only when:

- `routes_passed=true`
- `self_check_nonblocking=true`
- `self_check_timeout_recovery=true`
- `q4_assets_fetch=true`
- `q4_forward_pass=true`
- `tokens_generated_min>=1`
- `identity_route_fast=true`
- `greeting_route_fast=true`
- `fallback_recovery=true`
- `console_fatal_errors=0`
- `ui_freeze_detected=false`
- `open_blockers=[]`

Green local soak means the branch is ready for human review and preview verification. It does not merge the branch and does not grant product, browser, or release checkpoint admission.
