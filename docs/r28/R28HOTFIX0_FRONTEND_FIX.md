# R28HOTFIX0 Frontend Fix

## Fixed Production Symptoms

- Root and no-slash chat paths could show a stale/simple static shell.
- `/another_brain_chat?message=...` could load legacy root JS.
- Legacy root JS could throw `Cannot read properties of null (reading 'addEventListener')`.
- q4 runtime status could remain `synthetic_tiny`, `not checked`, and `tokens=0`.

## Changes

- Chat CSS/JS are loaded with absolute `/another_brain_chat/...` URLs.
- Runtime worker and runtime imports use `r28hotfix0-runtime-ui-activation` cache busting.
- Root page redirects to the canonical chat route and preserves query params.
- `vercel.json` redirects `/another_brain_chat` to `/another_brain_chat/`.
- A static `web/another_brain_chat.html` canonicalizer handles no-slash fallback serving.
- Chat and root event bindings use null-safe helper functions.
- Initialization waits for DOM readiness.
- Missing optional DOM nodes create trace warnings instead of fatal errors.
- The process panel remains visible by default on desktop.

## Public Process Panel

The UI shows public process summary stages:

- 输入包
- 本地上下文
- 检索证据
- 模型草稿
- 路由判断
- 最终回答

It does not display hidden chain-of-thought, system/developer prompts, or private raw data.
