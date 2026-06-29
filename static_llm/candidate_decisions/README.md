# Static LLM Candidate Decisions

This directory defines the reviewed decision record required before any future
static decoder artifact can enter R25 local intake.

R25G does not select a model, download weights, train, or admit assets. It only
defines the record shape and validation rules for a future reviewed candidate.

Decision files live under `static_llm/candidate_decisions/decisions/`.

Rules:

- A decision record does not admit weights.
- A selected decision still needs local artifact metadata and the R25E
  admission gate.
- Encoder-only candidates cannot be selected for the final product path.
- Server-required candidates cannot be selected.
- SLM or 100M-200M final-product target candidates cannot be selected.
- No backend, external storage, remote model API, or remote download is allowed.
- No chain-of-thought, hidden prompt, private path, or secret field is allowed.
- The purged prior candidate must not appear.

Use `template.json` as the starting point for a future local review.
