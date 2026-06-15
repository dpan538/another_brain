# Controlled Gate Training

R17 trains a controlled gate only: a multi-head classifier over labels such as domain, task type, question type, operation, answer policy, risk label, coverage requirement, verifier label, memory policy, runtime profile, backend preference, and template id.

It does not train final-answer generation, does not train a free generator, and does not replace deterministic solvers, privacy/copyright gates, culture coverage gates, or the draft verifier.

## Inputs

- `artifacts/training_os/reasoning_trace_training.jsonl`
- `artifacts/training_os/coverage_trace_training.jsonl`
- `artifacts/training_os/external_reasoning_trace_training.jsonl`
- `artifacts/training_os/persona_method_training_public.jsonl`
- `artifacts/training_os/r17_personal_runtime_policy_training.jsonl`

All artifacts are ignored outputs. They must pass their validators before training is considered meaningful.

## Objective

The current trainer is intentionally small and interpretable. It trains a token-based multi-head classifier and writes ignored artifacts:

- `artifacts/training_os/controlled_gate_model.json`
- `artifacts/training_os/controlled_gate_training_metrics.json`
- `artifacts/training_os/controlled_gate_confusion_matrices.json`
- `artifacts/training_os/controlled_gate_blind_failures.json`

This is controlled training, not mini-LLM generative training. It uses R17 rows to learn policy labels for 16-turn internal session memory, 4-turn visible UI boundaries, approved memory artifacts, runtime profiles, and WebGPU/WASM backend preference.

## Export Policy

`web/controlled_gate_model.generated.js` may be written only if:

- blind metrics meet the R17 thresholds;
- at least three train/eval cycles have run;
- the model is under the browser budget;
- validators find no private content, local paths, lyrics, or source-text leakage;
- the gate acts only as an advisor.

Until those conditions hold, the export script writes a report and leaves public runtime unchanged.

## Current Status

The R17 version is still a controlled classifier scaffold. It is useful for measuring label coverage, memory-policy behavior, runtime-profile behavior, and blind failures, but it should not be integrated into runtime until metrics and browser budget are strong enough.
