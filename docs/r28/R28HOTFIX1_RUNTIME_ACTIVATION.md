# R28HOTFIX1 Runtime Activation

R28HOTFIX1 keeps the HOTFIX0 runtime activation goal while removing redirect loops.

## Runtime Defaults

When committed q4 assets are available, the UI and runtime metadata default to:

- `runtime_mode=static_q4_experimental`
- `tokenizer=exact_runtime_tokenizer`
- `q4_forward` self-check available
- `hard router` enabled
- `non-product` warning visible

## Self-Check

The `检查本地模型路径` button remains visible in the default UI. It checks:

- asset manifest
- q4 shard listing
- exact runtime tokenizer
- q4 forward smoke
- generated token count
- fallback/blocker reason

If q4 runtime fails, the UI must show the blocker and fallback state. It must not claim a model draft when q4 forward did not run.

## Public Process Summary

The UI shows public process stages only:

- 输入包
- 本地上下文
- 检索证据
- 模型草稿
- 路由判断
- 最终回答

It does not expose hidden chain-of-thought, hidden prompts, system/developer prompts, or private raw data.
