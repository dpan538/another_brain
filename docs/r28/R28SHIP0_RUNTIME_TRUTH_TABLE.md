# R28SHIP0 Runtime Truth Table

R28SHIP0 treats runtime status as a consistency contract.

Rules:

- If `runtime_mode=static_q4_experimental`, q4 assets and exact tokenizer must pass.
- If `runtime_mode=static_q4_experimental`, q4 forward must be pass, warming, or timeout.
- If `q4_forward=false`, the UI must show a visible blocker such as `asset_missing`, `tokenizer_fail`, `forward_timeout`, or `worker_error`.
- If `q4_forward=true`, `tokens_generated` must be greater than zero.
- If `q4_forward=true`, answer source can be `model_draft`, `router_after_model_draft`, or `static_q4_experimental`.
- `answer_source=no_model_fallback` is not allowed without a visible blocker.

The implementation lives in:

- `src/browser_runtime/runtime_truth_table.ts`
- `web/another_brain_chat/browser_runtime.js`
