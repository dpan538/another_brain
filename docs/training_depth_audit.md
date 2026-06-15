# Training Depth Audit

This audit exists to prevent another_brain from calling path coverage "training."

## Contract

Recent work can be described using these labels:

- `path_coverage_only`: docs, evals, probes, and cards were added, but no train/dev/test rows, model metrics, or model artifact changed.
- `deterministic_gate_hardening`: runtime gates, planners, verifiers, or solvers changed and were evaluated, but no controlled model was trained.
- `data_expansion`: trace rows, splits, or structured training rows were built, but model training was not run or not exported.
- `controlled_training`: a bounded classifier/gate/verifier was trained with splits, metrics, confusion matrices, and safety validation.
- `mini_web_llm_progress`: browser profile, source registry, external knowledge reserve, controlled gate, verifier, and runtime readiness moved forward, but this still does not mean a free generator was trained.

## What Does Not Count As Neural Training

- Adding culture cards.
- Adding eval prompts.
- Passing black-box probes.
- Adding deterministic gates.
- Updating validators.
- Writing reports.
- Exporting generated card bundles.

These are useful, but they are path coverage or deterministic hardening unless they are paired with training rows, splits, metrics, and a trained controlled artifact.

## What Counts As Controlled Training

Controlled training requires:

- train/dev/test/blind split;
- labeled rows for `domain`, `task_type`, `question_type`, `operation`, `risk_label`, and verifier labels;
- metrics per head;
- confusion matrices or equivalent failure analysis;
- safety checks proving no raw private text, lyrics, long copyrighted text, or source paths enter the artifact;
- explicit proof that the model does not generate final answers.

## Output

Run:

```bash
node scripts/audit_training_depth.mjs
```

The report is written to:

```text
artifacts/training_os/training_depth_audit_report.json
```

The verdict must be used literally. If the verdict is `path_coverage_only` or `deterministic_gate_hardening`, later docs and status reports must not claim that active reasoning or mini Web-LLM training has been completed.
