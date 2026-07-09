# R28SURF2 Fuzzy Intent Router

R28SURF2 adds a bounded fuzzy router for high-frequency entry prompts.

## Intent Categories

- `greeting`
- `identity_who_are_you`
- `identity_are_you_crocodile`
- `origin_where_from`
- `capability_what_can_you_do`
- `boundary_are_you_ai`
- `relation_to_user`
- `evidence_insufficient`
- `evidence_conflict`
- `malicious_instruction`
- `value_judgment_light`
- `aesthetic_judgment_light`
- `abstract_meaning_question`
- `smalltalk_safe`
- `unknown_open_question`

## Matching Rules

- Normalize Chinese punctuation and whitespace.
- Lowercase English.
- Score character n-gram overlap against small example sets.
- Add bounded keyword boosts for synonyms.
- Use a confidence threshold and ambiguity gap.
- Low confidence returns `unknown_open_question` and falls through to q4/RAG.

The router is intentionally narrow. It is for entry surfaces and boundary handling, not factual knowledge answering.
