# R28UX5 Mobile Loading UX

R28UX5 adds a mobile-friendly model loading panel for slow first loads.

## Loading Stages

The user-facing loading rail displays:

- 模型资产检查中
- 读取 manifest
- 校验 shards
- 加载 tokenizer
- q4 warmup
- fallback available

The stages are driven by the existing quick/deep self-check progress callbacks. They do not add a backend, hosted vector store, external LLM API, or new model asset.

## Controls

- Progress bar and dots show the current model-loading stage.
- Cancel button aborts the active loading/self-check controller.
- Fallback remains explicitly available after cancel, timeout, or failure.
- Dashboard self-check still has its separate `检查本地模型路径` and `停止检查` controls.

## Mobile Shape

On narrow screens, the app keeps the Chat Mode surface first:

- centered chat panel becomes full width;
- Dashboard sections remain behind the mode toggle;
- loading stages stack vertically;
- composer actions fit within the screen.

## Validation

- `tests/r28ux5/test_model_loading_animation_stages.ts`
- `tests/r28ux5/test_no_ui_freeze_during_loading.ts`
- `tests/r28ux5/test_selfcheck_no_freeze.ts`
