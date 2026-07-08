# R28UX6 Loading Screen

R28UX6 keeps model startup in an independent Loading Mode before the user enters the main chat shell.

## Visible Loading States

The loading panel presents:

- title: `正在启动本地小模型`
- local SVG/CSS brain animation
- progress bar
- staged progress:
  - 读取模型清单
  - 校验模型分片
  - 加载 tokenizer
  - q4 warmup
  - fallback ready
- rolling copy:
  - 本地运行，不调用云端 LLM
  - 小模型加载可能需要几十秒
  - 如果模型不可用，会使用边界回答
  - 证据不足时不会硬编

## Cancel And Dashboard

`取消加载 / 进入轻量模式` dismisses the loading screen, cancels model self-check, and returns to Chat Mode with `synthetic_fallback` still usable. The Dashboard button dismisses the loading screen and opens the engineering dashboard without spawning a second self-check.

After either dismissal path, later warmup progress cannot reopen the full-screen loading panel.
