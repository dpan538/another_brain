# R25 LLM-First Static Architecture

R25 changes the product direction: Another Brain should become an LLM-first
browser system, not an SLM/rule-heavy product. R24 remains valuable, but its
role is safety harness, fallback layer, regression test suite, shard/routing
infrastructure, and verifier/finalizer boundary.

R24 micro-solvers, answer indexes, tiny-router paths, recovery gates,
held-out gates, shard-first runtime, source-of-truth knowledge pipeline,
behavior-collapse guardrails, and Vercel static checks must not become the main
intelligence layer. They wrap and test the future LLM path.

## Deployment Boundary

The target is a same-origin static decoder LLM running in the browser.

- Vercel hosts static files only.
- Static model assets must be served from the same origin.
- Browser cache/storage is allowed because it is user-local.
- No extra cloud backend or storage is allowed.
- No Vercel Function or Edge Function inference is allowed.
- No external LLM API is allowed.
- No hosted vector store, Blob, KV, Postgres, Redis, AI Gateway, or third-party
  model hosting is allowed for model loading.

R25A does not download, train, convert, or commit model weights. R25B should
choose and admit a real decoder artifact only after these gates are green.

## Main Answer Path

The intended product path is:

```text
input / state packet
  -> lightweight policy + routing precheck
  -> retrieval from local static shards
  -> static browser LLM draft
  -> verifier / finalizer / fallback firewall
  -> answer
```

The LLM may draft. The verifier/finalizer decides whether the draft can surface.
The fallback firewall still protects privacy, unknown, copyright, identity, and
method-boundary cases. The LLM must not answer from absent private evidence,
claim server capabilities, expose hidden prompts, or reveal chain-of-thought.

The LLM should not be replaced by hand-authored answer banks. R24 answer banks,
micro-solvers, and tiny-router behavior are retained only as fallback and
measurement infrastructure.

## Static Budget Profiles

The executable policy constants live in `scripts/static_llm_policy.mjs`.

| Profile | Budget target |
| --- | ---: |
| `hobby_static_llm_lite` | `<= 95 MB` deployable LLM assets |
| `pro_static_llm_full` | `<= 950 MB` deployable LLM assets |

Additional static constraints:

- Source file count target: `< 15000` files.
- Build time target: `< 45 minutes`.
- Target shard file size: `<= 32 MB`.
- Hard max shard file size: `<= 64 MB`.
- Static LLM assets are banned everywhere by default.
- Future weights are allowed only under approved static LLM asset paths, with
  manifest validation, budget validation, license/provenance review, and
  no-backend checks.

## R24 And R25 Gates

Future training and inference changes must be measured by R24 and R25 gates:

- R24 recovery candidate gate.
- R24 held-out and split-integrity gates.
- No-hardcoding and provenance gates.
- Anti-lobotomy and dialogue-boundary gates.
- Shard runtime and Vercel static checks.
- R25 static LLM manifest, budget, no-backend, candidate-matrix, and admission
  flow checks.

Training remains disabled by default. Real model admission belongs to R25B or
later, after a reviewed static decoder artifact is selected and the R25A gates
pass.
