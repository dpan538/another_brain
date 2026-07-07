# R28P0B Prelaunch Acceptance

The prelaunch acceptance gate checks:

- build gate is configured
- bundle remains under 100MB
- no backend inference
- no external LLM
- no Doubao
- no hosted vector store
- chat route files exist
- local-only badge exists
- RAG/debug panel exists
- adapter import/export controls exist
- asset cache status exists
- synthetic fallback remains available when no model is bound
- candidate route is visible
- no product model claim
- no phase 4 claim
- no release checkpoint claim
- same-origin manifest smoke passes
- mobile layout is present
- accessibility markers are present

This acceptance is a prelaunch branch gate, not product admission.

Current result:

- prelaunch acceptance: pass
- current tracked static runtime build output: `22227048` bytes
- A12 estimated full static bundle with q4 candidate: `98385593` bytes
- candidate injected bytes in tracked bundle: `0`
