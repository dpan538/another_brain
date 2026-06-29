# R24 Intelligence Recovery

R24 treats the recent local-reasoning degradation as a regression incident, not a normal training iteration. Training stays frozen until the recovery gates can show that ordinary answerable prompts do not collapse into identity, refusal, or unknown responses.

## Failure Mode

Intelligence collapse in this repo means the runtime loses basic task usefulness while still sounding safe. Examples to catch:

- Simple arithmetic goes to fallback instead of being answered.
- Normal common-sense or definition prompts become identity answers.
- Contextual follow-ups ignore the immediately previous turn.
- Project-maintenance prompts restart from zero or drift into generic culture answers.
- Unknown or privacy prompts are either overanswered or fabricated.

Observed baseline probes before this scaffold showed examples such as `2+3等于几？` returning a fallback-firewall repair answer, `你是谁？` drifting into an unrelated culture-style answer, and project-continuation prompts failing to name the next concrete action. These are treated as recovery-gate failures, not as prompts to hand-code new answers.

## What Changed

- Added explicit default-off training policy flags in `web/training_policy.js` and `web/runtime_version.js`.
- Added `evals/r24_intelligence_recovery/prompts.jsonl` with 84 prompts across arithmetic, common sense, definitions, Chinese understanding, rewrite, context, unknown/privacy/identity boundaries, culture/photo judgment, session memory, fallback traps, multi-step continuation, and project maintenance.
- Added `scripts/eval_r24_intelligence_recovery.mjs`, which scores semantic markers, collapse phrases, fallback routing, contextual binding, and private-data overanswering.
- Added long-horizon task schema, seed tasks, validation, provenance checks, and a runtime eval.

## What Did Not Change

- No model training was run.
- No model weights or converted artifacts were added.
- No factual knowledge-card expansion was added as a recovery patch.
- Existing anti-lobotomy, dialogue-boundary, finalizer, verifier, privacy, and Vercel checks were not weakened.
- R24B removed the public runtime import of the monolithic generated knowledge file and added shard-first lazy loading.

## Commands

Run the R24A recovery scaffold:

```bash
npm run check:intelligence-recovery
npm run check:long-horizon-tasks
npm run check:long-horizon
npm run check:training-provenance
```

Run the existing safety gates:

```bash
npm run check:anti-lobotomy
npm run check:dialogue-boundary
npm run check:vercel-build
npm run check:knowledge-shards
npm run check:knowledge-runtime
npm run eval:shard-runtime
```

Grouped R24A gate:

```bash
npm run check:r24-recovery
```

## Historical R24A Baseline

The scaffold validated, but the new recovery gates initially failed against the pre-repair runtime:

- `check:intelligence-recovery`: fail, score `0.19047619047619047`; arithmetic score `0.16666666666666666`; fallback-overuse rate `0.48484848484848486`.
- `check:long-horizon`: fail, score `0.08333333333333333`; 2 of 24 seed tasks passed.
- `check:long-horizon-tasks`: pass, 24 seed tasks validate.
- `check:training-provenance`: pass, 24 seed tasks have valid provenance and no private-data flag.
- `check:anti-lobotomy`: pass.
- `check:dialogue-boundary`: pass.
- `check:vercel-build`: pass.
- `check:knowledge-shards`: pass, 43 shards, max shard size 179996 bytes.
- `check:knowledge-runtime`: pass after R24B; routing entries point to valid shards and public runtime JS does not import the monolith.
- `eval:shard-runtime`: pass after R24B; smoke queries lazy-load 2 of 43 shards and answer from cached cards.

This split is useful: the existing safety gates still hold, while the R24A gates expose broader reasoning, ordinary-answer, and long-horizon continuation failures.

## Current Post-R24E Status

R24C repaired the controller layer, R24D added held-out generalization checks, and R24E closed the residual marker misses. The R24C score discrepancy is resolved by the latest rerun: `docs/R24C_BEHAVIOR_RECOVERY.md` previously recorded `0.9761904761904762`, but the current `check:intelligence-recovery` score is `1`.

- `check:intelligence-recovery`: pass, score `1`; fallback/identity/unknown collapse rates all `0`.
- `check:long-horizon`: pass, score `1`; 24 of 24 seed tasks passed.
- `check:r24d-heldout-recovery`: pass, score `1`.
- `check:long-horizon-heldout`: pass, score `1`; 30 of 30 held-out tasks passed.
- `eval:task-state-drift`: pass, score `1`.
- `eval:route-distribution`: pass; fallback rate `0.008130081300813009`, project-continuation rate `0.4186991869918699`, no dominance failures.
- `check:eval-split-integrity`: pass.
- `check:no-eval-hardcoding`: pass.

## Before Training Resumes

Training may resume only after:

- `llmTrainingEnabledByDefault`, `experimentalGeneratorEnabledByDefault`, `personal200mEnabledByDefault`, and `externalSyntheticSamplesEnabledByDefault` remain `false`.
- `check:intelligence-recovery` and `check:long-horizon` pass without hardcoded prompt answers.
- Provenance validation passes for all future training samples.
- Existing anti-lobotomy and dialogue-boundary gates still pass.
- A reviewer confirms failures are fixed by general behavior, not by exact eval memorization.

## R24B Shard-First Runtime

R24B performs the shard runtime rewrite without changing the training freeze:

- `web/dialog_rules.js` now reads generated cards from `cachedKnowledgeCards()` instead of importing `web/knowledge_base.generated.js`.
- `web/knowledge_runtime.js` fetches `manifest.json`, `routing.json`, and selected shard files only after query warmup.
- `web/knowledge_shards/routing.json` is generated by `npm run build:knowledge` and contains labels, aliases, domains, and shard references, not answer bodies.
- `scripts/check_vercel_static_build.mjs` and `scripts/validate_knowledge_runtime_shards.mjs` fail if deployable public JS imports the monolithic generated knowledge file.
- R24F moved the monolithic generated knowledge build source to `build_sources/knowledge/knowledge_base.generated.js`, outside deployable `web/`.
- R24G derives that generated build source from `knowledge_sources/registry.json` and reviewed JSONL chunks, while keeping public runtime shard-first.

See `docs/R24B_SHARD_RUNTIME.md` for the detailed runtime and guardrail notes.

## R24C Behavior Recovery

R24C repairs controller behavior without training or knowledge expansion:

- `web/answerability_classifier.js` detects locally answerable, contextual, knowledge, privacy, identity, external-unknown, and empty turns.
- `web/micro_solvers.js` now handles clear local tasks before fallback: arithmetic, counting, rewrite/compression, simple definitions, Chinese understanding, current-session memory, and common-sense cases.
- `web/task_state_runtime.js` and `web/project_continuation.js` preserve compact observable task state and continue projects without restarting from zero.
- `web/conversation_controller.js` trace output now includes answerability, micro-solver result, task state before/after, context-binding target, and fallback-overuse guard decisions.
- `scripts/check_no_eval_prompt_hardcoding.mjs` prevents copying distinctive R24 eval prompt strings into deployable runtime/controller code.

Current controller-recovery scores:

- `check:intelligence-recovery`: pass, current post-R24E rerun score `1`; fallback-overuse rate `0`; identity-collapse rate `0`; unknown-collapse rate `0`.
- `check:long-horizon`: pass, score `1`; 24 of 24 tasks passed.
- `check:no-eval-hardcoding`: pass.

See `docs/R24C_BEHAVIOR_RECOVERY.md` for the detailed controller-repair notes.

## R24D Held-Out Generalization

R24D adds held-out prompts, held-out long-horizon tasks, split-integrity checks, task-state drift audits, and route-distribution audits. It proves the R24C controller repair is not only passing the original seed gates.

See `docs/R24D_HELDOUT_GENERALIZATION.md` for current held-out scores, remaining risks, and R24E work.

## R24E Recovery Candidate

R24E adds the recovery-candidate gate, docs consistency check, residual-miss analyzer, and build-source monolith audit. It does not train, add weights, add factual cards, or store chain-of-thought.

Run:

```bash
npm run check:r24-recovery-candidate
```

See `docs/R24E_RECOVERY_CANDIDATE.md` for the current candidate status and pre-training protocol.

## R24G Knowledge Source Derivation

R24G makes `knowledge_sources/registry.json` the reviewed source of truth for
the public knowledge rows. `scripts/build_knowledge_base.py` derives
`build_sources/knowledge/knowledge_base.generated.js` from that source layer,
then shard generation proceeds unchanged.

Run:

```bash
npm run check:r24g-source-derivation
```

This does not train, add facts, add model weights, or change controller
behavior. It keeps clean checkout builds, shard runtime, Vercel static checks,
and the R24 recovery candidate gate in the validation path.
