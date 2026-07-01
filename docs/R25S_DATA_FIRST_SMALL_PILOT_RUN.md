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

## R25T Review Boundary

R25T analyzes R25S before any further pilot is considered. It compares R25S
against R25P on train/dev/held-out behavior, train-to-eval gaps, and weaker
bucket held-out losses. R25T does not run training, does not rerun R25S, and
does not approve phase_4 scaled training.

If R25T recommends an architecture ablation design, that is still design-only.
Any R25U/R25V training requires a fresh one-shot reviewer approval marker, and
the R25S replayable checkpoint remains an ignored pilot artifact rather than a
release checkpoint.

R25V, if approved, compares a two-layer same-width architecture ablation against
this R25S baseline. R25S artifacts remain ignored baseline evidence only and do
not authorize any R25V rerun, phase_4 training, or release admission.

R25W/R25X keep R25S as the best pilot so far when the R25V ablation worsens
dev and held-out loss. Any future data-regularization pilot must preserve the
split boundary and requires fresh reviewer approval.

R25Y later ran one such data-regularization pilot and preserved the R25S
one-layer architecture. R25Y improved held-out loss versus R25P and R25V but
not versus R25S, so R25S remains the best-so-far baseline for phase 3 review.
