# R28HOTFIX1 Static Route Smoke

`scripts/r28hotfix1_static_route_smoke.py` verifies the static route model without starting a backend server.

## Checked Routes

- `/`
- `/another_brain_chat`
- `/another_brain_chat/`
- `/another_brain_chat?message=你是谁`
- `/another_brain_chat/?message=你是谁`

## Expected Result

Each route resolves to a static file with:

- `status=200`
- `redirect_count=0`
- `R28HOTFIX1`
- `过程摘要`
- `static_q4_experimental`
- `exact_runtime_tokenizer`
- `检查本地模型路径`

## Latest Local Result

The latest local smoke passed for all five routes. No backend route, Vercel Function, or Edge Function is required.
