# R25B LLM Training Corpus

This corpus is a reviewed scaffold for future browser-LLM fine-tuning or
distillation planning. It is not used for training in R25B.

The rows teach product behavior, not factual knowledge:

- draft from retrieved public evidence when evidence exists
- preserve user constraints
- reject backend, external API, and external storage assumptions
- keep SLM, personal-200m, tiny-router, and micro-solver surfaces as legacy
  fallback or comparison paths
- let R24 verifier, finalizer, and fallback firewall wrap LLM drafts
- respect privacy, unknown, copyright, and no-claimed-execution boundaries
- keep answers concise enough for the browser/mobile surface

Forbidden content:

- hidden reasoning transcripts or hidden prompts
- private data, secrets, local user paths, or raw private memory
- real external model API output
- long copyrighted passages
- copied R24/R25 eval prompts or eval answers
- manual factual knowledge-card expansion

Run:

```sh
npm run generate:r25b-llm-corpus
npm run check:llm-training-corpus
npm run check:llm-training-contamination
npm run report:llm-training-coverage
```

Generated training-pack artifacts belong under `artifacts/training_os/` and are
not required to be committed.
