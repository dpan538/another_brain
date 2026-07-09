# R28POSTMERGE17 Query Profile Reasoning

## Scope

This pass improves Chinese-first retrieval, answer routing, and chat voice without training, model asset changes, backend inference, external LLM calls, or raw private source export.

The local question-pack material was used only as a style and reasoning summary source. No raw prompt, raw answer, private row text, or document text is copied into runtime cards, tests, or UI.

## Observable Style Signals

The local answered samples show a repeatable answer habit:

- Start with a short position instead of a long explanation.
- Use boundary language when evidence is weak.
- Split fact, value, aesthetic, and definition questions before judging.
- Resist pressure without becoming defensive.
- Reframe unclear questions instead of refusing too early.
- Keep a small amount of personality, but do not turn the answer into a joke.
- Avoid process disclosure in the customer chat surface.

This is not an answer bank. The runtime cards store generalized moves, not sample answers.

## Vulnerability Reasoning

The previous system still had these failure modes:

- Object drift: broad words like meaning, useful, important, convenient, and time could overpower the real object.
- False binary: questions framed as either-or could force an answer into a bad category.
- Context pollution: short follow-ups needed context, but full new questions should not inherit old objects.
- Evaluation confusion: comments like too long or too stiff were sometimes treated as knowledge questions.
- Tone collapse: many fallback answers shared the same structure and became visibly formulaic.
- Pressure handling: hostile or teasing input needed a human rhythm instead of a system-like refusal.
- Knowledge versus reasoning confusion: failures needed to distinguish missing facts from missing structure.

## Implemented Reasoning Model

The query profile now separates more independent lanes:

- `identity`
- `pressure`
- `tone_request`
- `value_conflict`
- `relation_advice`
- `knowledge_gap`
- `category_error`
- `feasibility`
- `degree`
- `method`
- `proof`
- `objection`
- `context`
- `evaluation`

Each lane has compatible neighbors, but incompatible lanes are down-ranked. For example, a concrete infrastructure question should not drift into temporal philosophy just because it contains a broad word like meaning or convenience.

## Answer Voice Rules

The answer layer now uses small local variants for repeated categories:

- identity: answer as crocodile / another efish without engineering exposition.
- pressure: stay playful and bounded; do not overclaim.
- tone request: acknowledge style repair and invite the next question.
- value conflict: separate fact, value, and cost.
- relationship: focus on trust, boundary, and consequence.
- knowledge gap: state what can be known and stop before pretending.

Same-session repeated questions are handled separately. A repeated exact question is treated as dialogue rhythm, not a new retrieval task.

## Non-Claims

- No model training was performed.
- No model weights, q4 shards, checkpoints, tokenizer training artifacts, raw corpus, or private source text were committed.
- No backend inference or external LLM API was added.
- These changes improve routing, retrieval hints, and customer-facing answer style; they do not claim new model admission.
