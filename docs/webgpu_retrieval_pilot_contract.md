# WebGPU Retrieval Pilot Contract

WebGPU is optional assist, not authority.

R20 begins WebGPU work only on low-risk, measurable assist paths. The pilot may improve retrieval quality, follow-up binding, rerank, and verifier/gate latency; it must not decide hard safety or response-mode boundaries.

## Allowed Uses

- embedding retrieval
- semantic rerank
- follow-up binding rerank
- topic shift suggestion
- optional controlled gate acceleration
- optional verifier acceleration

## Forbidden Uses

- hard privacy/copyright/source boundary decision
- memory write approval
- deciding whether an explicit question becomes affordance
- deciding whether repair is eligible
- public-default generator
- browser-side training
- remote/cloud inference

## Reporting Rules

- Mock embeddings must be reported as mock.
- WebGPU unavailable must be reported as unavailable, not pass.
- WASM/deterministic fallback must remain available.
- No model weights, checkpoints, adapters, LoRA files, or raw corpora may be committed.
- personal_200m must remain disabled by default.

## First Pilot Path

Typed/lexical/graph retrieval reduces candidates first. Embedding/rerank may process at most a small candidate set, defaulting to 64 candidates. If WebGPU is unavailable, the same query must remain answerable through deterministic lexical ranking.

