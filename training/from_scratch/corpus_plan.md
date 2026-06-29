# From-Scratch Corpus Plan

R25B added 480 behavioral scaffold rows. Those rows are useful for shape and
validation, but they are not enough for formal LLM training.

Formal from-scratch training needs orders of magnitude more reviewed rows or
generated-and-reviewed data. R25I defines the mix; it does not generate a large
corpus and does not start training.

R25J uses the existing reviewed scaffold only for tokenizer dry-run extraction:
`training/llm_corpus/train.jsonl` supplies tokenizer training text, while
`dev.jsonl` and `heldout.jsonl` are evaluation-only. Eval prompt files, root
PDFs/DOCX, and public-ingestion scratch data are excluded.

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

R25L expands this surface into separate `r25l_train.jsonl`, `r25l_dev.jsonl`,
and `r25l_heldout.jsonl` files. The generator uses deterministic
project-authored templates and generic repo-derived behavioral evidence only.
It does not read root PDFs/DOCX, `data/public_ingestion/`, eval prompts,
private raw data, or external model output.

R25L rows are preparation material for later review. They are not eval data,
not factual knowledge-card expansion, and not proof that formal decoder
training has started.
