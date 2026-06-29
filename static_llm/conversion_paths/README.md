# Static LLM Conversion Paths

R25G tracks browser-runtime format classes, not named models.

The matrix explains whether a future reviewed decoder artifact is plausibly
browser-runnable under the same-origin static deployment policy. It does not
download, convert, train, admit, or benchmark a model.

Rules:

- Raw checkpoints are not automatically browser-runnable.
- GGUF is not accepted without an approved browser runtime path.
- No external CDN runtime is allowed.
- No remote model loading is allowed.
- Every future path must still pass manifest, budget, no-backend, and R24/R25
  gates before production admission.
