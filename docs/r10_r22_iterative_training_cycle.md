# R10-R22 Iterative Training Cycle

R10-R22 is not a single release milestone. It is a recurring training and audit loop for culture, reasoning, memory, fallback safety, endpoint behavior, typed control, and natural surface governance.

The goal is not to make every report say "passed." The goal is to keep cycling through:

1. Detect current behavior.
2. Train only approved control or runtime components.
3. Re-run old gates.
4. Keep audit-only failures honest.
5. Generalize failures into families before runtime changes.
6. Push safe, reviewed changes to `main`.

## Covered Stages

- R10: culture coverage and culture cards.
- R11: reasoning behavior.
- R13: coverage and blind-gate regression.
- R17: 16-turn internal memory and WebGPU memory readiness.
- P0/R18: fallback collapse, anti-lobotomy, finalizer/firewall, non-question affordance.
- R19/R20: conversation controller, contextual binding, endpoint readiness, mobile density, WebGPU retrieval pilot.
- R21: typed control-gate training, failure bank, family splits, mixed dialogic sessions, anti-overfit scan.
- R22: natural surface audit, shadow surface semantic verification, proxy leakage, missing primitive triage.

## Non-Negotiables

- Do not expand answerIndex to fix current failures.
- Do not add exact-prompt branches.
- Do not add entity-specific runtime patches.
- Do not weaken old evals or thresholds.
- Do not treat audit-only success as behavior success.
- Do not promote shadow natural surface without semantic verification and human blind review.
- Do not claim deployed parity without a deployed parity probe.

## Cycle Modes

`cycle:r10-r22:quick` runs the highest-signal gates across R10-R22 and writes reports.

`cycle:r10-r22:full` adds heavier browser/deployed probes, endpoint stress, WebGPU pilot checks, and full `npm run check`.

The script writes:

- `artifacts/training_os/r10_r22_cycle_report.json`
- `artifacts/training_os/r10_r22_cycle_history.jsonl`
- `artifacts/training_os/r10_r22_cycle_log.md`

## Success Meaning

A clean cycle means no blocking regression was found in the selected gates.

It does **not** mean:

- natural surface is finished;
- R22 shadow candidate is production-ready;
- all known legacy template debt is gone;
- broad data/training expansion is safe without review.

Any cycle that sees R22 `audit_only=true` must preserve that state in the report. Audit-only execution is useful instrumentation, not behavioral completion.
