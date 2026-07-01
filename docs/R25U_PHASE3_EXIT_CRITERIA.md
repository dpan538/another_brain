# R25U Phase 3 Exit Criteria

R25U does not run training. It defines the review criteria for deciding whether
phase 3 small-pilot work should continue, pause, or eventually request a
separate phase_4 scaled-training review.

Phase_4 scaled training is not approved by R25U. Passing the criteria is a
necessary review input, not authorization. Any later training requires a fresh
reviewer approval marker, consumed one-shot after use, with no product,
long-term, release, phase_4, or weight-commit permission unless a future review
explicitly changes that boundary.

The phase 3 exit criteria require:

- at least three bounded pilot runs reviewed
- a replayable ignored checkpoint from the latest relevant pilot
- finite held-out replay loss
- train/dev and train/held-out gaps under configured thresholds unless a
  reviewer accepts an explicit exception
- weak-bucket language, task-type, family, and policy-tag breakdown reviewed
- R24 recovery candidate green
- no-hardcoding, eval-split-integrity, training-provenance, anti-lobotomy, and
  dialogue-boundary gates green
- Vercel/static release gates green
- no tracked weights, product claims, release checkpoint admission, external
  backend/storage, external LLM API, remote downloads, chain-of-thought data, or
  eval prompt training

R25T showed that R25S improved the data-first generalization picture, but R25U
keeps the next move in phase 3. The appropriate next step is design and review,
not phase_4 training.

R25V remains inert unless a reviewer later creates a fresh approval marker. The
committed R25V template uses `approved:false` and cannot authorize training.

When R25V is explicitly approved, it still remains phase 3. Even if the
two-layer ablation runs and held-out replay is finite, it does not satisfy
phase_4 approval by itself and does not admit a release checkpoint.

R25W adds a decision ledger after R25V. Because the reported R25V run worsened
dev and held-out loss versus R25S, phase_4 remains blocked and the next default
state is review rather than scaling.
