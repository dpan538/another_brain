# R25I From-Scratch LLM Training Doctrine

R25I corrects the R25 roadmap: the final target is a project-trained decoder
LLM trained from scratch, then exported as a same-origin static browser artifact
that fits the measured Vercel static envelope.

Training is not started in R25I. This patch adds doctrine, schemas, phase
planning, and anti-regression checks only.

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
