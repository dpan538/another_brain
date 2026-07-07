# R28UX3 No CoT Boundary

We display process summary, not hidden chain-of-thought.

We show evidence status, runtime route, model/fallback status, and finalizer decision.

We never expose hidden prompts, developer prompts, private data, or internal reasoning.

The process panel is for public operational transparency only:

- whether local context was present
- whether retrieval ran
- evidence status and source summaries
- whether static q4 forward actually ran
- whether exact runtime tokenizer was visible
- whether router/finalizer replaced a draft
- why fallback was used

This layer must not become a hidden prompt viewer, broad answer bank, eval prompt display, or private data renderer.
