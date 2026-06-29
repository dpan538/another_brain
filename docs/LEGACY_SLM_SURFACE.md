# Legacy SLM Surface

R25 demotes the previous SLM and personal-200M planning surface. Those files are
not the final product target. They are retained only when they help as R24
fallback, comparison, or regression infrastructure.

## Retained As R24 Gates

- Recovery evals and held-out evals.
- No-hardcoding and split-integrity checks.
- Anti-lobotomy, fallback-overuse, and dialogue-boundary checks.
- Shard runtime, source-derivation, and Vercel static checks.

## Retained As Fallback Runtime

- Fallback firewall.
- Draft verifier and finalizer boundaries.
- Privacy, unknown, copyright, and identity boundaries.
- Minimal micro-solvers for sanity checks.
- Task-state fallback and continuation tracking.

## Demoted From Product Path

- Tiny router as the main answer source.
- `personal_200m` / personal-200M as the future product target.
- Mini web LLM readiness as final model admission.
- SLM candidate selection scripts.
- Answer-bank expansion as intelligence repair.
- Manual knowledge-card expansion as the main way to recover intelligence.

The active R25 target is a same-origin static browser decoder LLM wrapped by R24
verifier/fallback infrastructure.

## Decommission Plan

Do not delete historical files in R25A unless a follow-up review says they are
safe to remove. Instead:

1. Keep old scripts callable for comparison.
2. Add deprecation warnings where scripts frame 100M-200M SLMs as candidates.
3. Use `npm run audit:slm-legacy-surface` to classify legacy surface area.
4. Move or delete archive candidates only after R25 static LLM gates stabilize.
5. Use `npm run check:no-slm-product-target` to prevent active product docs or
   scripts from re-promoting SLM, personal-200M, mini-web-LLM, or tiny-router
   paths as the main intelligence layer.

## Forbidden For R25

- Cloud inference.
- Server inference.
- Vercel Function or Edge Function LLM inference.
- External model APIs.
- Repo-local unreviewed model weights.
- Chain-of-thought training data.
- Answer-bank expansion as intelligence repair.

## R25B Stage 2

R25B keeps old surfaces callable where they still protect the product as tests,
fallbacks, or comparison points. It adds no training and no weights. The main
line is the static browser decoder LLM scaffold plus R24 verifier/fallback
wrapping.
