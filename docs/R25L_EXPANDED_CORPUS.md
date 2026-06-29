# R25L Expanded Corpus

R25L expands the reviewed LLM training-corpus surface for a future small
decoder pilot. It generates deterministic project-authored rows under
`training/llm_corpus/r25l_*.jsonl` with train/dev/heldout separation.

R25L corpus rows are not eval data, not factual knowledge-card expansion, not
an answer bank, and not external model output. They are behavioral examples for
boundaries, evidence use, route planning, rejection repair, tokenizer-sensitive
prompts, toy-training boundaries, and static release packaging boundaries.

Rules:

- no formal decoder training happens
- no small decoder pilot training happens
- no external LLM/API is called
- no remote downloads are used
- no chain-of-thought data is added
- no private data, local paths, root PDFs/DOCX, or `data/public_ingestion/`
  inputs are used
- no backend, external storage, hosted vector DB, model API, or third-party
  model hosting is added
- no weights or generated tokenizer artifacts are committed

The expanded corpus can improve training-readiness only after validation,
contamination checks, coverage reporting, and tokenizer dry-run evaluation pass.
Formal training progress remains `0%`.
