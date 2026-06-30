# R25P Second Small Pilot Run

R25P runs exactly one approved second bounded small decoder pilot variant:
`r25p_more_sequences_128`.

The run is still `phase_3_small_decoder_pilot`. It is not phase 4 scaled
training, not long-term training, not product-scale training, not a release
checkpoint, and not a browser static artifact. The approval marker is one-shot
and must be consumed after the run.

R25P uses:

- `training/llm_corpus/r25l_train.jsonl` for training rows only
- `training/llm_corpus/r25l_dev.jsonl` for bounded dev sanity metrics
- `training/llm_corpus/r25l_heldout.jsonl` for replay evaluation only
- the R25L dry-run tokenizer artifacts
- local numeric backend support only

R25P must not read eval prompts, root PDFs/DOCX, `data/public_ingestion/`,
private raw data, factual knowledge cards, external LLM output, or
chain-of-thought data.

All R25P outputs stay under ignored
`artifacts/training_os/small_decoder_pilot/r25p/`. The replayable checkpoint is
JSON-only and is used for held-out replay. It remains ignored, untracked,
`product_model:false`, `release_checkpoint:false`, and `commit_allowed:false`.

Product training progress remains `0%`. Formal decoder training progress
remains `0%`. Pilot progress may increase separately after the R25P run, eval,
held-out replay, approval-consumption check, artifact guard, and R24/R25 gates
pass.

Future training after R25P requires a new reviewer approval marker. R25P does
not authorize another pilot run, architecture scaling, release admission,
backend inference, external APIs, downloads, LoRA, adapters, fine-tuning, or
committed weights.
