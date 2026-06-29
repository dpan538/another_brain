# R25L Corpus Expansion Plan

R25L prepares a larger reviewed training-corpus surface for a future phase 3
small decoder pilot. It does not run small decoder training, product-scale
training, long-term training, or any formal decoder LLM training.

## Target

- Total rows: at least 2400.
- Train rows: at least 1600.
- Dev rows: at least 400.
- Heldout rows: at least 400.
- Source types: project-authored deterministic templates and repo-derived
  behavioral examples only.
- Languages: `zh`, `en`, and `mixed`.
- Families: at least 30 behavior and boundary families.

## Boundaries

- No external LLM output.
- No eval prompt copying.
- No chain-of-thought data.
- No private raw data.
- No root PDFs or DOCX files.
- No `data/public_ingestion/` input.
- No factual knowledge-card expansion.
- No answer-bank expansion as an intelligence substitute.
- No backend, external storage, hosted vector DB, model API, or remote model
  hosting dependency.
- No model weights, tokenizer artifacts, pilot checkpoints, or release weights
  are committed.

The expanded corpus is behavioral training material for later review. It is not
eval data, not a benchmark, and not proof that a product model exists.
