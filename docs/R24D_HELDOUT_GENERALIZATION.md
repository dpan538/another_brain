# R24D Held-Out Generalization

R24D exists because R24C made the original recovery gates green, but that alone did not prove the repair generalized. This patch adds held-out prompts, held-out long-horizon tasks, split-integrity checks, task-state drift audits, and route-distribution audits.

This is not a training patch. No external LLM APIs, model weights, converted artifacts, chain-of-thought samples, or factual knowledge-card expansion are used.

## Seed Vs Held-Out

Seed gates are the R24A/R24C checks that drove the controller repair:

- `evals/r24_intelligence_recovery/prompts.jsonl`
- `training/long_horizon/seed_tasks.jsonl`

Held-out gates are new R24D checks that should not be copied from seed prompts:

- `evals/r24d_heldout_recovery/prompts.jsonl`
- `training/long_horizon/heldout_tasks.jsonl`

The split-integrity check compares seed, held-out, and runtime/controller files so eval text does not leak into deployable runtime logic.

## Current Scores

Latest post-R24E rerun results:

- `check:intelligence-recovery`: pass, score `1`.
- `check:long-horizon`: pass, score `1`; 24 of 24 seed tasks passed.
- `check:r24d-heldout-recovery`: pass, score `1`.
- `check:long-horizon-heldout`: pass, score `1`; 30 of 30 tasks passed.
- `eval:task-state-drift`: pass, score `1`.
- `eval:route-distribution`: pass; fallback rate `0.008130081300813009`, project-continuation rate `0.4186991869918699`, no dominance failures.
- `check:eval-split-integrity`: pass.
- `check:no-eval-hardcoding`: pass.

The R24C documentation discrepancy is resolved: the older R24C doc recorded `check:intelligence-recovery` as `0.9761904761904762`; the current rerun is `1`.

## What Changed

- Added 108 held-out recovery prompts across arithmetic, counting, rewrite, definitions, Chinese understanding, follow-ups, memory, project continuation, constraints, Vercel/static reasoning, shard runtime continuation, privacy, unknowns, identity, density, repair, and drift traps.
- Added 30 held-out long-horizon tasks with provenance and semantic scoring.
- Added `check:eval-split-integrity` to catch duplicate prompts, high-similarity held-out copies, and eval text copied into runtime.
- Added `eval:task-state-drift` to catch topic drift after interruptions, side questions, changed constraints, and project returns.
- Added `eval:route-distribution` to catch hidden route collapse or an overly broad micro-solver/project-continuation route.
- Repaired task-state routing generally: training-regression direction checks outrank generic schema continuation; explicit split/drift/route tasks bind to the current turn; technical `address` no longer triggers privacy; held-out and no-claimed-execution constraints are preserved.

## Remaining Risks

- R24E closed the seed long-horizon miss, held-out long-horizon miss, and held-out recovery internal failures without weakening thresholds.
- R24F moved the monolithic generated knowledge build source to `build_sources/knowledge/knowledge_base.generated.js`, outside deployable `web/`.
- The next risk is keeping the recovery candidate gate green while future work touches controller routing or build-source defaults.

## Commands

```bash
npm run check:eval-split-integrity
npm run check:no-eval-hardcoding
npm run check:r24d-heldout-recovery
npm run check:long-horizon-heldout
npm run eval:task-state-drift
npm run eval:route-distribution
npm run check:r24d-generalization
```

## Training Remains Frozen

Future LLM training may resume only after seed and held-out gates remain green, provenance validation passes, no-hardcoding and split-integrity checks pass, and a reviewer confirms the fix is general behavior rather than prompt memorization.

Future synthetic samples must include provenance, review status, license or permission where required, and `contains_private_data: false` unless explicitly reviewed. They must not store chain-of-thought, hidden prompts, raw private data, local paths, API keys, or copied long copyrighted text.
