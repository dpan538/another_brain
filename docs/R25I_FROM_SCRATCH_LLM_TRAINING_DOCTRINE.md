# R25I From-Scratch LLM Training Doctrine

R25I corrects the R25 roadmap: the final target is a project-trained decoder
LLM trained from scratch, then exported as a same-origin static browser artifact
that fits the measured Vercel static envelope.

Training is not started in R25I. This patch adds doctrine, schemas, phase
planning, and anti-regression checks only.

R25J may run tokenizer dry-run infrastructure, but that is not formal decoder
training. R25K may run a reviewer-approved toy-only overfit sanity check, R25L
may expand corpus rows and plan a small decoder pilot, and R25M may run one
reviewer-approved bounded small decoder pilot to ignored artifacts. None of
these are product model training, release checkpoint admission, or static
browser deployment.

R25N evaluates the R25M outputs, adds structural held-out pilot evaluation, and
consumes the R25K/R25M one-shot approval markers. R25N is not a training run.
R25O designs the next bounded pilot and replayable ignored-checkpoint protocol
only; it is also not a training run and does not approve R25P.
R25P may run exactly one approved second bounded pilot, and R25Q analyzes that
result without running training. R25Q does not approve R25R or phase 4 scaled
training.

## Product Target

- Final model origin: project-trained from scratch.
- Runtime target: same-origin static decoder LLM running in the browser.
- Release target: static files hosted by Vercel with browser-local cache.
- Safety wrapper: R24 verifier, finalizer, fallback firewall, shard runtime,
  and recovery regression gates.
- Static release gates: R25 manifest, budget, no-backend, capacity, admission,
  first-token, and payload checks.

Do not treat candidate admission as model selection. Treat it as release
packaging for a future self-trained model unless explicitly marked as
baseline/compatibility.

## Non-Goals

- Existing pretrained model selection is not the main product path.
- LoRA, fine-tuning, adapters, or external foundation-model adaptation are not
  the final product strategy.
- External model artifacts may be used only as explicitly reviewed baselines or
  temporary compatibility fixtures.
- Fixture first-token smoke is not model performance.
- Factual knowledge-card expansion is not an intelligence substitute.

## Training Boundaries

- Training remains disabled by default.
- Formal training progress is currently `0%`.
- Tokenizer dry-run artifacts, when present, are local ignored preparation
  artifacts and not production tokenizer releases.
- Tiny toy decoder commands must skip by default and must not write tracked
  weights.
- Small decoder pilot commands must skip by default until a later explicit
  phase 3 approval marker exists. With the R25M approval marker, only the
  bounded small pilot may run, and its artifacts must stay ignored.
- R25M loss decrease is a mechanics signal only; product training progress
  remains `0%`.
- R25N approval-marker consumption means R25K/R25M markers are audit records,
  not reusable permission for new runs.
- R25O R25P approval template is committed with `approved:false`; template
  markers and consumed markers cannot authorize training.
- R25P may run exactly one fresh-approved second bounded pilot variant,
  `r25p_more_sequences_128`, and must consume that approval immediately after
  the run.
- R25Q analyzes R25P replay, held-out breakdown, and overfit risk without
  training. It may add an R25R approval template only with `approved:false`.
- Replayable small-pilot checkpoints, if a future approved run writes them,
  must remain ignored JSON artifacts and must not be release checkpoints.
- No real model weights are added in R25I.
- No remote model weights are downloaded.
- No external LLM API or unreviewed external model output is used.
- No chain-of-thought data is stored.
- No raw private data, local private paths, secrets, or copied long copyrighted
  text may enter the training corpus.
- No Vercel backend, storage product, hosted vector store, remote model API, or
  server inference path may be used.

## How Existing R25 Gates Change Meaning

R25E and R25H remain useful, but their primary role is release packaging for
the project's own trained artifacts:

1. A future training run produces a reviewed checkpoint.
2. The checkpoint is quantized and exported into browser-ready static assets.
3. A release decision records training run, architecture, tokenizer, corpus,
   checkpoint, quantization, static profile, and reviewer.
4. R25E/R25H validate manifest hashes, shard layout, budget, backend format,
   deploy payload, first-token readiness, and no-backend policy.
5. R24 wraps any future draft path as verifier/finalizer/fallback harness.

Compatibility or baseline imports can still exercise these gates, but they must
be labeled `baseline_external_for_comparison_only` and must not become the
product target.

R25L planning may move the current phase label to
`phase_3_small_decoder_pilot_planned` after corpus, tokenizer dry-run, and
pilot-plan checks pass. That label means planning is ready for review; formal
training progress remains `0%`.

R25M may move the current phase label to `phase_3_small_decoder_pilot` only
after the approval-gated bounded pilot, pilot eval, artifact guard, and R24/R25
gates pass. It does not admit release weights and does not create a product
model.

R25N may move the current phase label to
`phase_3_small_decoder_pilot_evaluated` after analysis, held-out structural
evaluation, approval-marker validation, and R24/R25 gates pass. It does not
start new training and does not approve the next pilot automatically.

R25O may move the current phase label to
`phase_3_second_small_pilot_designed` after the second-pilot plan, replayable
checkpoint schema, replay-heldout scaffold, historical comparison, and approval
template validation pass. This is still design-only and does not run R25P.

R25P may move the current phase label to
`phase_3_second_small_pilot_completed` only after the approved
`r25p_more_sequences_128` run, replayable checkpoint validation, held-out replay
eval, approval consumption, artifact guard, and R24/R25 gates pass. It is still
not phase 4 scaled training, product-scale training, long-term training,
release checkpoint admission, or browser static deployment.

R25Q may move the current phase label to
`phase_3_second_small_pilot_analyzed` after R25P analysis, replay determinism,
held-out breakdown, history comparison, R25R template validation, and R24/R25
gates pass. It does not run new training, does not rerun R25P, does not approve
R25R, and does not approve phase 4 scaled training.
