# R29B0 full browser dialogue runtime contract

R29B0 is an engineering-candidate vertical slice only. It must not admit a
product, browser release, checkpoint, or deployment, and it must not replace
R28M1. Checkpoints, optimizer state, generated outputs, and corpora remain in
ignored `artifacts/`.

Before any dialogue SFT, the runtime gate requires a canonical full-context
reference, q4 v2 reference/export parity, real browser WebGPU inference, real
local WASM fallback, full prefill and incremental KV-cache decoding, exact
tokenizer/wrapper parity, persistent verified cache, and the stated static and
startup budgets. A fallback/retrieval/rule answer cannot count as model output.

The supervisor is a single attached foreground process. Its only terminal
states are `PASSED_ENGINEERING_CANDIDATE`, `BLOCKED_WITH_EVIDENCE`, and
`ABORTED_SAFELY`; every state and heartbeat update is atomic.

Generated dialogue acceptance requires real model output through all seven
layers, causal contextual attention, KV cache, and browser parity. Training
uses assistant-response-only loss only after the runtime gate passes.
