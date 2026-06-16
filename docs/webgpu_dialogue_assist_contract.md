# WebGPU Dialogue Assist Contract

WebGPU-assisted response mode classification is optional, not authoritative.

Allowed assist tasks:

- declaration-with-signal vs quiet declaration
- follow-up binding rerank
- topic shift suggestion
- user-intent-boundary confidence
- clarification candidate rerank
- embedding retrieval
- semantic rerank
- optional gate/verifier acceleration

Forbidden authority:

- privacy, copyright, or source boundary
- memory write approval
- whether an explicit question becomes affordance
- whether repair is eligible
- whether public runtime should use `personal_200m`

WebGPU is useful for embedding, rerank, gate, and verifier acceleration, but public runtime must maximize structured understanding per byte, not free generation per byte.

