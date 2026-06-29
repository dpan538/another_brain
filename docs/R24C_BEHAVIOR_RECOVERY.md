# R24C Behavior Recovery

R24C repairs controller behavior after the R24A/R24B scaffolding exposed broad answer collapse. It does not train a model, call external APIs, add weights, or add factual knowledge cards.

## Starting Point

After R24B, the infrastructure checks passed but behavior gates still showed regression:

- `check:intelligence-recovery`: failed, score `0.19047619047619047`, fallback-overuse rate `0.48484848484848486`.
- `check:long-horizon`: failed, score `0.08333333333333333`, 2 of 24 tasks passed.

The dominant failures were ordinary prompts routed to generic fallback, identity/unknown collapse, weak current-session binding, and project-continuation prompts restarting or drifting.

## What Changed

- Added `web/answerability_classifier.js` to classify local, contextual, knowledge, privacy, identity, external-unknown, and empty turns.
- Extended `web/micro_solvers.js` with local arithmetic, counting, rewrite, short definition, Chinese-understanding, current-session memory, and common-sense paths.
- Added `web/task_state_runtime.js` to track compact observable task state: goal, topic, constraints, known status, last next action, and rewrite source.
- Added `web/project_continuation.js` for bounded continuation answers when enough current-session task context exists.
- Updated `web/operation_layer.js` so privacy boundaries still win, micro-solvers answer clear local tasks before fallback, external unknowns stay bounded, and project continuation happens before generic culture/fallback drift.
- Updated `web/conversation_controller.js` trace output with answerability, micro-solver result, task state before/after, context-binding target, and fallback-overuse guard decisions.
- Added `scripts/analyze_r24_recovery_failures.mjs`, `scripts/check_no_eval_prompt_hardcoding.mjs`, and `scripts/eval_r24c_behavior_repair.mjs`.

## Anti-Hardcoding

`check:no-eval-hardcoding` scans R24 recovery prompts and long-horizon seed task turns against deployable runtime/controller files. It allows eval files and docs, but fails if long distinctive eval prompt strings are copied into runtime logic.

This keeps the patch aimed at general controller repair rather than memorizing recovery prompts.

## Behavior Rules

- Clear local tasks use micro-solvers before fallback.
- Contextual follow-ups bind to recent turns or active task state when sufficient context exists.
- Privacy and unknown boundaries remain explicit and bounded.
- Identity answers only answer identity questions; they do not override arithmetic, common sense, or task continuation.
- Project continuation preserves user constraints and gives a next action without pretending to have run commands.

## Results

After R24C:

- `check:intelligence-recovery`: pass. The original R24C note recorded score `0.9761904761904762`; the post-R24D rerun reconciles the discrepancy at score `1`, with fallback-overuse, identity-collapse, and unknown-collapse rates all `0`.
- `check:long-horizon`: pass, score `1`; 24 of 24 tasks passed; collapse rates all `0`.
- `check:no-eval-hardcoding`: pass.

The previous remaining miss around `detect_bad_training_direction_001` was repaired generically in R24D by making training-regression direction checks outrank generic long-horizon/schema continuation. R24E also closed the local-first marker miss by preserving default-local, static Vercel, no-training, and no-cloud-inference markers in deployment follow-ups.

## R24D Follow-Up

R24D adds held-out recovery prompts, held-out long-horizon tasks, eval split integrity checks, task-state drift audits, and route distribution audits. Current R24D reruns:

- `check:r24d-heldout-recovery`: pass, score `1`.
- `check:long-horizon-heldout`: pass, score `1`, 30 of 30 tasks passed.
- `eval:task-state-drift`: pass, score `1`.
- `eval:route-distribution`: pass, no dominance failures.
- `check:eval-split-integrity`: pass.
- `check:no-eval-hardcoding`: pass.

## Commands

```bash
npm run analyze:r24-failures
npm run check:no-eval-hardcoding
npm run eval:r24c-behavior
npm run check:intelligence-recovery
npm run check:long-horizon
npm run check:anti-lobotomy
npm run check:dialogue-boundary
npm run check:r24b-shard-runtime
npm run check:vercel-build
npm run check:r24d-generalization
```

## Still Not Training

Training remains disabled by default. Future LLM work still needs:

- recovery gates passing on held-out prompts
- provenance validation for any new samples
- no chain-of-thought storage
- no model weights in repo or `web/`
- bounded generator use only after deterministic routing, retrieval, verifier, and fallback firewall
