# Static LLM Candidate Decisions

This directory defines the reviewed decision record required before any future
compatibility or baseline static decoder artifact can enter R25 local intake.
It is no longer the main product-selection surface.

R25G does not select a model, download weights, train, or admit assets. It only
defines the record shape and validation rules for a future reviewed candidate.
R25I adds `static_llm/release_decisions/` for the product path: future
self-trained release artifacts from the project's from-scratch training
pipeline.

Decision files live under `static_llm/candidate_decisions/decisions/`.

Rules:

- A decision record does not admit weights.
- A decision record does not make an external pretrained model the product.
- A selected decision still needs local artifact metadata and the R25E
  admission gate.
- Encoder-only candidates cannot be selected for the final product path.
- Server-required candidates cannot be selected.
- SLM or 100M-200M final-product target candidates cannot be selected.
- No backend, external storage, remote model API, or remote download is allowed.
- No chain-of-thought, hidden prompt, private path, or secret field is allowed.
- The purged prior candidate must not appear.

Use `template.json` as the starting point for a future baseline or compatibility
review. Use `static_llm/release_decisions/template.self_trained.json` for the
future product release path.
