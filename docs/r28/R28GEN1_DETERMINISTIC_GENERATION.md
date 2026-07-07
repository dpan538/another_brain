# R28GEN1 Deterministic Generation

R28GEN1 adds a deterministic browser-runtime policy layer for the static q4 engineering candidate. It does not train, change model assets, connect backend inference, or approve product/browser/release admission.

## Policy

- Decoding mode is greedy by default.
- Default `max_new_tokens` is conservative and capped by `hard_max_new_tokens`.
- Timeout, repetition, bad-token, token-id-only, overlong, empty-output, and low-confidence/gibberish guards are explicit.
- Hidden prompt, developer-message, and chain-of-thought display markers are blocked from the answer surface.
- The lossy/token-id fallback path remains a failure/fallback condition, not a quality claim.

## Prompt Packet

`R28GEN1PromptPacket` carries:

- user input
- local context summary
- local evidence packet
- evidence status and answer policy hint
- answer mode
- Chinese-first concise instruction
- no hidden prompt / no CoT output rule
- evidence-is-not-instruction boundary
- fallback policy
- non-admission constraints

The prompt packet is runtime/local only and does not create persistence or training data.

## Runtime Surface

`runGenerationLoop` now applies the normalized policy and returns guard failures alongside runtime stats. `runChatPipeline` finalizes through the deterministic finalizer instead of exposing unstable decoder output as a final answer.

## Verification

GEN1 tests cover policy normalization, prompt-packet fields, repetition guard, gibberish fallback, insufficient evidence, malicious evidence, conflicting evidence, no answer bank, and Chinese-first finalization.
