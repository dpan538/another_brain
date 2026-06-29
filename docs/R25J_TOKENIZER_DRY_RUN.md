# R25J Tokenizer Dry-Run

R25J adds a deterministic tokenizer dry-run pipeline for phase 1 preparation.
This is not formal decoder LLM training and it does not create a production
tokenizer.

The dry-run reads only `training/llm_corpus/train.jsonl` for tokenizer training
text. It writes local artifacts under ignored `artifacts/training_os/` paths.
Development and held-out corpus files are used only for tokenizer evaluation.

R25L adds an optional expanded-corpus dry-run config:
`training/from_scratch/tokenizer_dry_run_config.r25l.json`. It trains dry-run
tokenizer text from `training/llm_corpus/r25l_train.jsonl`, evaluates on
`r25l_dev.jsonl` and `r25l_heldout.jsonl`, and writes ignored artifacts under
`artifacts/training_os/tokenizer_dryrun/r25l/`. The R25J default config remains
unchanged.

Boundaries:

- no eval prompt files are read for tokenizer training
- no root PDFs, DOCX files, or `data/public_ingestion/` inputs are read
- no chain-of-thought, hidden prompts, private raw data, or secrets are allowed
- no external LLM API, remote download, backend, or storage product is used
- generated tokenizer artifacts are not committed
- formal training progress remains `0%`

The dry-run measures structure: deterministic vocabulary construction,
round-trip sanity, unknown-token behavior, and zh/en/mixed segmentation risk.
It does not claim production tokenizer quality.
