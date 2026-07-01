# R25Y Data-Regularization Pilot Run

R25Y ran exactly one reviewer-approved bounded data-regularization pilot:
`r25y_data_regularized_192`.

This is still phase 3 small-pilot work. It is not product training, not
long-term training, not phase_4 scaled training, not release checkpoint
admission, and not a browser static artifact. The approval was one-shot and is
consumed after the attempt; future training requires a new reviewer approval
marker.

R25Y keeps the R25S one-layer causal decoder baseline:

- backend: `python_torch`
- architecture: `causal_decoder_pilot`
- actual layers: `1`
- parameters: `566080`
- learning rate: `0.003`
- train/dev/heldout sequences: `192 / 48 / 48`
- steps: `80`

Regularization knobs recorded by the run:

- lower learning rate than R25S
- deterministic train-row shuffle
- target-answer repetition cap
- rejected-answer example preference
- focus-bucket balancing through the R25S balanced sampling plan
- compare-to-R25S reporting
- `stop_if_dev_loss_worsens` is recorded as unsupported by the current bounded
  runner rather than faked

Observed losses:

- train loss: `8.522901693979898 -> 3.0795193960269294`
- dev loss: `8.5032852490743 -> 5.429250796635945`
- held-out replay loss: `5.1359784205754595`

Against R25S, R25Y had higher final train loss, higher final dev loss, and
higher held-out replay loss. That means this data-regularization attempt did
not improve the best-so-far R25S result. It did improve held-out loss versus
R25P and R25V, but the R25S baseline remains the strongest local phase 3
pilot by the current replay metrics.

R25Y writes only ignored artifacts under
`artifacts/training_os/small_decoder_pilot/r25y/`. The replayable JSON
checkpoint is for held-out evaluation only, remains ignored, is not
commit-allowed, and is not a release checkpoint.

Boundaries:

- product training progress remains `0%`
- formal decoder training progress remains `0%`
- phase_4 scaled training remains blocked and unapproved
- no external APIs or remote downloads are used
- no backend inference or external storage is introduced
- no chain-of-thought, private raw data, eval prompts, root PDFs/DOCX, or
  `data/public_ingestion/` are used
- no named pretrained model is selected
- no LoRA, adapters, or fine-tuning path is introduced as the final strategy

R24/R25 gates remain required after the run.
