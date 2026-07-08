# R28LOAD0 Mobile Loading UX

R28LOAD0 adds an independent loading panel above the chat surface.

## UI Elements

- CSS/SVG local brain icon animation.
- Progress bar.
- Five visible steps:
  - 读取 manifest
  - 校验 shards
  - 加载 tokenizer
  - q4 warmup
  - fallback available
- Rolling local-only copy:
  - 正在加载本地小模型
  - 不会调用云端 LLM
  - 如果模型不可用，会使用边界回答
  - 证据不足时不会硬编
- Cancel/later button.
- Dashboard button for the desktop process panel.

## Mobile Rules

At `max-width: 720px`, the loading panel becomes a centered card, steps stack into one column, and the action buttons use two equal-width columns. Text uses `overflow-wrap` and fixed progress dimensions to avoid overflow.

## Nonblocking Contract

The panel does not disable the composer. Cancelling the loading panel aborts self-check only; it does not cancel chat input, local retrieval, or boundary answering.
