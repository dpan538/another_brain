# Static LLM Release Decisions

Release decisions describe future static browser artifacts, with the product
path reserved for models trained from scratch by this project.

A release decision does not commit weights, admit assets, or enable runtime
drafting. It records the training run, architecture, tokenizer, corpus,
checkpoint, quantization, static profile, and reviewer needed before R25E/R25H
artifact gates can evaluate a release.

Allowed origins:

- `self_trained_from_scratch`: the product path.
- `baseline_external_for_comparison_only`: comparison or compatibility only.
- `fixture`: loader and gate smoke only.

Decision files belong under `static_llm/release_decisions/decisions/`. Do not
store private paths, secrets, chain-of-thought, raw private data, or model
weights here.
