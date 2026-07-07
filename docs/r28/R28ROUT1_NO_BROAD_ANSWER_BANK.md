# R28ROUT1 No Broad Answer Bank Boundary

R28ROUT1 is not a broad answer bank.

It only handles a small set of boundary and entry-surface intents:

- greetings
- identity
- crocodile identity confirmation
- origin
- capability
- local/runtime status
- evidence boundary prompts
- malicious instruction boundary prompts

It does not answer arbitrary factual, creative, technical, or personal questions from templates. Low-confidence or ambiguous prompts remain `unknown_open_question` and continue through the normal q4 draft plus local retrieval plus router/finalizer path.

The surfaces are indexed selectable fragments, not a broad FAQ corpus. A route may select from a tiny safe set, for example a crocodile confirmation can choose either a direct or softer identity fragment. This keeps the answer from feeling mechanically fixed without claiming model intelligence.

The fragments must not include eval prompts, private facts, old excluded question-pack rows, hidden prompts, or chain-of-thought.
