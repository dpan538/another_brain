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

Training remains disabled by default. R25B adds training-content and decoder
admission scaffolding only: a separated LLM corpus, split/contamination checks,
fixture-only asset loader tests, and no-SLM product-target enforcement. R25C
adds local artifact intake, dry-run manifest generation, sharding plans, and
no-unapproved-weight guards. Real model commitment still requires explicit user
approval after a reviewed static decoder artifact passes the R25A/R25B/R25C
gates.

R25D adds the browser backend abstraction, worker shell, tokenizer/config
loader scaffold, stronger asset sha/cache helpers, and a first-token smoke
harness. With no admitted artifact, R25D passes only in fixture/blocked mode:
the fixture backend emits a deterministic smoke token, production inference is
reported unavailable, and real first-token smoke is skipped instead of faked.

R25E attempts real local artifact admission from approved inbox paths only. If
no reviewed decoder artifact is present, the correct result is a green blocked
report requesting one. Real weights still require a per-candidate production
approval marker, Pro profile budget fit, real hashes, backend compatibility,
and green R24/R25 gates before commit.

R25F resets candidate selection to a model-agnostic state. The active repo must
not name a primary decoder model until a later reviewed model decision or a
user-supplied local artifact passes the admission path.

R25G adds that reviewed model-decision framework. Candidate decision records,
conversion path review, and the request pack come before R25E artifact
admission, and none of those records admit weights by themselves.
