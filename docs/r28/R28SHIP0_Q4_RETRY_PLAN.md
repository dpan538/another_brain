# R28SHIP0 q4 Retry Plan

If q4 initial mount fails, R28SHIP0 runs Plan B before fallback:

1. `primary`
2. `normalized_absolute`
3. `cache_bust`
4. `clear_model_cache`
5. `worker_restart`

Attempt schema:

```json
{
  "attempt": 1,
  "strategy": "primary",
  "manifest": "pass",
  "shards": "pass",
  "tokenizer": "pass",
  "q4_forward": "pass",
  "blocker": ""
}
```

UI must show:

- 正在重试模型加载
- 第几次尝试
- 当前策略
- 失败原因
- 最终 fallback reason

Fallback is valid only after the retry plan is exhausted or the user cancels loading.
