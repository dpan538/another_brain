# WebGPU Retrieval Pilot

R20 adds a retrieval pilot rather than a public-default generator. The runtime can detect WebGPU/WASM/storage capability, expose embedding and rerank interfaces, and benchmark honest modes: real, wasm, mock, or unavailable.

The pilot is intentionally conservative:

- deterministic typed retrieval remains first;
- lexical ranking remains a valid fallback;
- WebGPU may rerank candidates after typed/lexical narrowing;
- WebGPU is never authoritative for hard boundaries, memory writes, explicit-question affordance, or repair eligibility;
- no model weights are committed;
- personal_200m and public-default generation remain disabled.

The first acceptance target is operational honesty: if the environment lacks WebGPU or real model artifacts, reports must say so. A mock path may support deterministic tests, but it must never be labeled as real inference.

