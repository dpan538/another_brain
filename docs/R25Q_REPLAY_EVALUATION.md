# R25Q Replay Evaluation

R25Q uses the R25P replayable ignored JSON checkpoint to test replay
determinism and held-out breakdowns. These checks do not train and do not
modify checkpoint tensors.

The replay determinism check loads the R25P checkpoint, replays dev and
held-out evaluation twice, and verifies that the metrics are finite and stable
within a tight tolerance. A deterministic replay result means the checkpoint can
be evaluated independently of the training command. It does not mean the pilot
is a product model.

The held-out breakdown reads R25L held-out rows for evaluation only. It reports
sequence counts, finite-loss status, average next-token loss when replay is
available, and known-token coverage by:

- language
- task type
- task family
- policy tag

Held-out text must not be used for training. Eval prompts, root PDFs/DOCX,
`data/public_ingestion/`, private data, factual knowledge cards, hidden prompts,
and chain-of-thought data remain forbidden.

Replay reports are ignored local artifacts under
`artifacts/training_os/small_decoder_pilot/r25q/`. They must not be copied into
`web/`, `static_llm/assets/`, `build_sources/`, or `knowledge_sources/`, and
they must not be staged or committed.

R25Q replay analysis can inform an R25R reviewer decision, but it cannot
authorize another pilot, phase 4 scaled training, release admission, backend
inference, or committed weights.
