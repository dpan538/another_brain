# R25D First-Token Smoke

The R25D first-token smoke harness verifies the path that a future admitted
static decoder artifact must use:

1. load the manifest
2. load tokenizer/config
3. inspect model shard headers
4. verify sha256 for loaded assets
5. select browser capability and backend
6. initialize the backend
7. request one first token
8. wrap the draft path with verifier/fallback contract checks

The fixture smoke is not a performance benchmark and is not evidence that a
real model is available. It exists only to prove that the static loader,
worker/backend shape, tokenizer/config path, and policy checks are connected.

If no production manifest is admitted, `npm run eval:static-llm-first-token`
returns `ok: true` only when:

- fixture first token succeeds
- production is skipped with reason `no_admitted_static_llm_manifest`
- no backend, external storage, or remote model URL is used
- fixture output does not expose hidden prompts or chain-of-thought markers

Real first-token success belongs to R25E or later, after the user supplies and
approves a reviewed local decoder artifact under the static Pro profile.

R25E adds `--require-production` mode. That mode must fail unless a production
manifest is admitted and a real backend, not the fixture or an R25D stub,
observes the first token.

R25F keeps real first-token readiness model-agnostic. A future run must name a
candidate only after a separate reviewed model decision or user-supplied local
artifact.
