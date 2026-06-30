# R25N Small Pilot Evaluation

R25N evaluates the existing R25M bounded small decoder pilot outputs. It does
not run new training, does not rerun the toy overfit sanity, and does not rerun
the small decoder pilot.

The R25M loss decrease was small but valid as a pipeline signal:

- train loss decreased from `8.3175417582194` to `8.295666694641113`
- dev loss decreased from `8.317312240600586` to `8.300430297851562`
- dev loss remained finite
- artifacts stayed under ignored `artifacts/training_os/small_decoder_pilot/r25m/`

This does not prove product intelligence. It only confirms that the local
dataset, tokenizer, numeric backend, bounded optimization loop, and report
plumbing can work together.

R25N adds a held-out pilot evaluation that reads `training/llm_corpus/r25l_heldout.jsonl`
for evaluation only. It does not train on held-out text. Because the R25M
checkpoint is an ignored JSON digest with `weights_serialized: false`, held-out
evaluation is structural: it reports a bounded next-token-pair coverage metric
and tokenization sanity instead of pretending to compute true model loss.

Product training progress remains `0%`. Pilot progress remains separate from
product progress. No weights, tokenizer artifacts, pilot reports, chain-of-
thought data, factual knowledge cards, external APIs, downloads, backend
storage, or release checkpoints are added.

Any R25O or second bounded pilot must be reviewer-approved with a fresh
one-shot approval marker and must run R24/R25 gates before and after the run.

R25O follows this by designing R25P only. It records that the R25M checkpoint is
not replayable for true held-out loss because it has no serialized tensors, and
it adds a replayable ignored JSON checkpoint protocol for any later approved
R25P run. R25O itself does not train.
