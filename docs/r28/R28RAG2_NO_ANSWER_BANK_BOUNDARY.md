# R28RAG2 No Answer Bank Boundary

R28RAG2 is not a broad answer bank.

It does not add canned answers for general questions, FAQ rows, or hand-authored final responses. Static memory records are evidence snippets with source metadata. The answer still flows through:

input/state packet -> static/local retrieval -> q4 draft if available -> hard router/finalizer -> answer surface

Allowed static records:

- synthetic/public-safe/demo-safe evidence
- source/provenance metadata
- reviewed boundary fixtures for insufficient, conflict, or malicious-evidence behavior

Forbidden records:

- eval prompts
- hidden prompts
- private facts or raw private data
- old excluded `question_pack_001` rows 51-100
- broad general-knowledge answer rows
- backend/vector-store connection data

The router may use identity or boundary surfaces that already exist for safety and UX stability, but R28RAG2 must not become a general-purpose template answer system.
