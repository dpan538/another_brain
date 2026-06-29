# From-Scratch Corpus Plan

R25B added 480 behavioral scaffold rows. Those rows are useful for shape and
validation, but they are not enough for formal LLM training.

Formal from-scratch training needs orders of magnitude more reviewed rows or
generated-and-reviewed data. R25I defines the mix; it does not generate a large
corpus and does not start training.

Rules:

- no chain-of-thought
- no eval prompt copying
- no private raw data
- no long copyrighted text
- no unreviewed external model output
- no factual knowledge-card expansion as intelligence substitute
- train/dev/heldout split policy before use
- provenance and review status for every source

The corpus must teach behavior, boundaries, evidence use, and dialog control,
not memorize answer banks.
