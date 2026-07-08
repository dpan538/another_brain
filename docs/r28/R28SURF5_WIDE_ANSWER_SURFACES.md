# R28SURF5 Wide Answer Surfaces

R28SURF5 adds a wider compositional answer-surface layer for tiny SLM UX. It is used for micro-intents, evidence boundaries, abstract/value fallback, and q4 timeout or unavailable fallback.

It does not answer arbitrary factual questions from stored rows. Ordinary open questions still route through q4/RAG when q4 is ready.

## Categories

- `greeting`
- `identity`
- `origin`
- `capability`
- `model_status`
- `evidence_insufficient`
- `evidence_conflict`
- `malicious_evidence`
- `abstract_value_fallback`
- `aesthetic_fallback`
- `relation_fallback`
- `language_meaning_fallback`
- `q4_timeout_fallback`
- `q4_unavailable_fallback`
- `smalltalk_safe`
- `refusal_boundary`

## Runtime Trace

The public process trace carries:

- `route`
- `intent`
- `surface_category`
- `used_model_draft`
- `final_answer_source`
- `length_policy`

The browser runtime mirrors the TypeScript runtime instead of relying on a backend, external LLM, Doubao, or hosted vector store.
