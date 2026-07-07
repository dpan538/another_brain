# R28ROUT1 Fuzzy Intent Router

R28ROUT1 adds a small fuzzy micro-intent router for frequent entry questions in the browser runtime. It is a product-surface guard and response-shape layer, not a model replacement.

## Intents

- `greeting`
- `identity_who_are_you`
- `identity_are_you_crocodile`
- `origin_where_from`
- `capability_what_can_you_do`
- `boundary_are_you_ai`
- `runtime_status`
- `evidence_insufficient`
- `evidence_conflict`
- `malicious_instruction`
- `smalltalk_light`
- `unknown_open_question`

## Matching

The matcher normalizes Chinese punctuation, lowercases English, computes character ngram overlap, applies a small keyword boost, and requires a confidence threshold. Exact examples are fast-path matches. Ambiguous or low-confidence inputs are routed as `unknown_open_question`.

## Runtime Behavior

High-confidence greeting, identity, origin, capability, boundary, and runtime-status questions return through router surfaces without waiting for q4 generation. The process trace records:

- `route`: `greeting_surface`, `identity_surface`, `origin_surface`, `capability_surface`, or `runtime_status_surface`
- `used_model_draft=false`
- `final_answer_source=router_surface`
- `reason=micro_intent_fast_path`
- optional `fragment_ids` for indexed surface fragments

Open factual or exploratory questions still go through q4 draft, local retrieval, hard router, verifier, and finalizer.
