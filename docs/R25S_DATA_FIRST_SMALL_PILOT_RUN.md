# R25S Data-First Small Pilot Run

R25S runs exactly one reviewer-approved bounded data-first pilot:
`r25s_data_first_balanced_192`.

The run is still phase 3 small-pilot work. It is not product training, not
long-term training, not phase_4 scaled training, not release checkpoint
admission, and not a browser static artifact. The run may write local ignored
artifacts only under `artifacts/training_os/small_decoder_pilot/r25s/`.

R25S uses the R25R balanced sampling plan: 192 train rows, 48 dev rows, and 48
held-out rows prepared for replay evaluation only. Training rows come only from
`training/llm_corpus/r25l_train.jsonl`; dev rows come only from
`training/llm_corpus/r25l_dev.jsonl`; held-out rows come only from
`training/llm_corpus/r25l_heldout.jsonl` and are not used for training.

The pilot writes a replayable JSON checkpoint for held-out replay loss. That
checkpoint remains ignored, is not commit-allowed, and is not a release
checkpoint. It must not be copied into `web/`, `static_llm/assets/`,
`build_sources/`, or `knowledge_sources/`.

The R25S approval is one-shot. After the run it is consumed, and active
training approvals return to zero. Any future pilot requires a new explicit
reviewer approval marker.

R25S boundaries:

- product training progress remains `0%`
- formal decoder training progress remains `0%`
- pilot progress may increase only to `3%`
- no external APIs or remote downloads are used
- no backend inference or external storage is introduced
- no chain-of-thought data, private raw data, eval prompts, root PDFs/DOCX, or
  `data/public_ingestion/` are used
- no named model is selected
- no LoRA, adapters, or fine-tuning path is introduced as the final strategy

R24/R25 gates remain required after the run.
