# R25AN Next-Step Boundary

R25AN completed post-R25AM corpus, sampler, and tokenizer readiness review without approving decoder training.

## Decision

- Recommendation: ready_for_r25ao_bounded_microcycle_review
- Decoder training approved: false
- Small-pilot training approved: false
- Phase_4 approved: false
- Product training progress: 0%

## Reasons

- R25AM-expanded tracked corpus passed boundary audit
- zh-first sampler can satisfy 70/20/10 plans without replacement for reviewed plan sizes
- R25AN tokenizer dry-run artifacts validated structurally

## Risks

- uniform full-corpus use remains below zh >= 70%; future micro-cycle must use a zh-first sampler or add more Chinese rows
- uniform full-corpus use remains above en <= 10%; future micro-cycle must cap English rows

## Boundary

R25AO remains a future approval-only step. Any bounded Chinese-personal micro-cycle needs fresh explicit approval, must use the R25AM-expanded corpus with split integrity, and must not automatically follow from this tokenizer dry-run. Tokenizer artifacts and weights remain uncommitted.
