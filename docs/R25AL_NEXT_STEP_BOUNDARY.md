# R25AL Next-Step Boundary

R25AL completed corpus and tokenizer readiness review without approving training.

## Decision

- Recommendation: needs_more_chinese_personal_corpus
- Decoder training approved: false
- Small-pilot training approved: false
- Phase_4 approved: false
- Product training progress: 0%

## Reasons

- expanded tracked corpus passed hard boundary audit
- R25AL tokenizer dry-run artifacts validated structurally

## Risks

- combined corpus remains below the future zh >= 70% target for uniform full-corpus use

## Boundary

R25AM remains a future approval-only step. Any bounded Chinese-personal micro-cycle needs fresh explicit approval, must preserve split integrity, and must not automatically follow from this tokenizer dry-run. Tokenizer artifacts and weights remain uncommitted.
