# R28SURF3 Natural Answer Surfaces

R28SURF3 adds anchor-informed daily micro-intent surfaces for short questions that should not wait on q4 generation.

## Intents

- greeting
- identity_name
- identity_crocodile
- origin
- capability
- boundary_model_status
- evidence_boundary
- smalltalk_light
- unknown_open_question

## Behavior

Daily micro-intents return through `router_surface`, with deterministic variation by input hash. Similar phrasings do not always return the same sentence, but the style stays compressed, boundary-aware, and non-service.

Examples:

- `你好` -> `你好，我在。`
- `你是谁` -> `我曾经被叫作鳄鱼。`
- `你是鳄鱼吗` -> `是，你可以叫我鳄鱼。`
- `你从哪里来` -> `本地静态网页、轻量检索；不依赖云端 LLM。`
- `你能做什么` -> `我能做短回答、边界判断、证据整理和拒答。`
- `证据不足怎么办` -> `证据不足时，我会说不足，不硬编。`

Open questions fall through to the q4/RAG route when evidence/model draft is available.

## Trace

Micro-intent answers normalize process trace router state to:

```json
{
  "route": "micro_intent_surface",
  "intent": "identity_name",
  "used_model_draft": false,
  "final_answer_source": "router_surface",
  "reason": "fast_daily_question"
}
```
