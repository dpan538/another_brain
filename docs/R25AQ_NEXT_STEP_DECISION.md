# R25AQ Next-Step Decision

R25AQ does not train, rerun R25AO, run tokenizer dry-run, expand corpus, or approve phase_4.

## Decision

Recommendation: `approve_r25ar_later_with_fresh_approval`.

Recommended future design, if later approved: `r25ar_zh65_mixed25_en10_lower_intensity`.

## Why Not Repeat R25AO

- R25AO met the zh-first sampler target but heldout regressed against the best prior reference.
- Mixed and en buckets were weaker than zh.
- Several task families showed high heldout loss.
- The consumed R25AO approval cannot be reused.

## Why Sampler Repair

- Mixed is more important than generic English because repo work is Chinese-first with technical mixed terms.
- A zh65/mixed25/en10 target directly addresses mixed weakness while keeping English capped.
- Lower steps and learning rate reduce repeat-risk from fitting train/dev without heldout improvement.

## Boundary

R25AR is not approved now. Any future run requires fresh explicit reviewer approval and must remain one bounded phase_3 pilot. Product training progress remains 0%, formal decoder training progress remains 0%, phase_4 remains blocked, and no weights or artifacts are committed.
