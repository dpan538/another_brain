# R25AB Chinese-First Training Doctrine

The personal model target is Chinese-first. English is secondary and
supportive. Future training cycles should preserve Chinese expression,
project continuity, local-first browser reasoning, and personal tone before
chasing generic English benchmark fluency.

## Language Policy

Future reviewed training mixes should target:

- `zh`: at least 70%.
- `mixed zh/en`: about 20%.
- `en`: at most 10%, unless a technical boundary requires more.

English may appear for code terms, technical configuration, dependency names,
unavoidable API or package terms, and bilingual robustness. English must not
dominate the corpus or become the default voice.

Evaluation must separately track `zh`, `mixed`, and `en` buckets. A cycle can
look healthy overall and still fail if the Chinese bucket weakens, if mixed
answers become awkward, or if English fluency hides loss of project tone.

## R25AB Boundary

R25AB is doctrine, design, and validation only. It does not train, does not
generate new corpus rows, does not rewrite R25L, does not approve phase_4, and
does not create or commit weights.

R25AC may later become one bounded Chinese-first personal micro-cycle only
after fresh reviewer approval. That future cycle should upsample Chinese and
mixed rows from reviewed sources while keeping held-out text out of training.

R25AC follows this doctrine when approved: it targets `zh >= 70%`, mixed
Chinese/English near `20%`, and `en <= 10%`; English remains secondary and
technical. Its held-out reports must keep `zh`, `mixed`, and `en` buckets
separate so Chinese quality cannot be hidden by aggregate loss.

## R25AD Corpus Lesson

R25AD shows that sampling can satisfy the Chinese-first ratio while quality
still regresses against R25S. Future R25AE work should add reviewed zh and
mixed Chinese-personal rows, not merely repeat the same R25L rows. R25AE is a
future corpus-expansion review design only in R25AD; it does not authorize
training, phase_4, product progress, release checkpoints, or committed weights.

## R25AL Post-Promotion Lesson

R25AK improves Chinese-first direction through a zh-primary promoted subset,
but R25AL must still review the combined corpus before any future micro-cycle.
The combined tracked corpus may remain below the future `zh >= 70%` target if
used uniformly. R25AL tokenizer dry-run is not decoder training, does not
approve phase_4, and does not make R25AM automatic; any R25AM run requires
fresh approval and Chinese-first sampling or more reviewed Chinese rows.

## R25AM Expansion Lesson

R25AM may add a second reviewed Chinese-personal repo-derived split, but it is
still corpus work only. It does not run tokenizer dry-run or decoder training.
If the combined corpus remains below `zh >= 70%` or above `en <= 10%`, the next
step should be more reviewed Chinese-personal rows or an approved sampler, not
an automatic training run.
