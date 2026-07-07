# R28GEN0 Deterministic Generation Policy

R28GEN0 adds a deterministic browser-runtime generation policy around the existing static candidate. It does not train, change model shards, add backend inference, or create an answer bank.

## Scope

- Base branch: `origin/r28tok0-exact-runtime-tokenizer` when available.
- Runtime path: local browser runtime only.
- Model assets: unchanged R28M1 q4 static assets.
- Admission status: not product-admitted, not browser-admitted, not release-admitted.

## Prompt Packet

`GenerationPromptPacket` now carries:

- user input
- local session context
- retrieved evidence packet
- evidence status and answer policy hint
- answer mode
- non-product runtime constraints
- Chinese-first concise instruction
- no hidden prompt / no chain-of-thought output rule
- fallback policy

The packet is local-session-only and does not permit training, persistence, backend retrieval, external LLM use, Doubao, or hosted vector store access.

## Generation Policy

Default policy:

- decoding: greedy
- default max new tokens: 16
- max token cap: 64
- timeout guard: 3000 ms by default
- repetition guard: enabled
- stop token handling: enabled
- bad-token guard: enabled
- empty output fallback: enabled
- token-id-only fallback: enabled
- lossy decode warning: enabled

The policy surfaces `fallback_reason`, `finish_reason`, generated token count, decode status, runtime mode, and guard flags to the worker/UI path.

## Boundaries

GEN0 does not make generated text a product-quality claim. If the small static model emits unstable output, the answer surface switches to deterministic fallback text rather than inventing facts.
