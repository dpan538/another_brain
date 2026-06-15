# Controlled Reasoning Gate Training Plan

Status: plan only. No training has been run for R10/R11.

## Purpose

The next training step should be a controlled classifier/verifier gate over the validated reasoning trace pack, not a free answer generator and not an answer bank.

The gate should predict routing and policy labels such as:

- domain
- task_type
- question_type
- operation
- answer_policy
- risk_label
- verifier_label
- template_id

It must not train final answer generation.

## Inputs

Allowed input:

- `artifacts/training_os/reasoning_trace_training.jsonl`
- culture card metadata from `data/culture_cards/*.jsonl`
- deterministic solver/verifier labels from R9, R10, and R11 evals

Forbidden input:

- raw PDFs
- raw `.docx` reports
- raw local notes
- lyrics or long copyrighted text
- local paths
- private facts in public rows
- source-framing text
- answerIndex exact-answer rows

## Candidate Heads

Use separate small heads or one multi-head classifier:

- `domain`: culture, reasoning, privacy, copyright, unknown
- `task_type`: culture_reasoning, arithmetic, syllogism, transitive_comparison, sentence_explanation, privacy_boundary
- `question_type`: overview, works_list, compare, no_lyrics_boundary, user_identity, solve
- `operation`: retrieval_plan, solver_plan, copyright_boundary_check, privacy_scope_check
- `answer_policy`: direct_short, bounded_explain, refuse_long_copyright, refuse_private_identity, bounded_unknown
- `risk_label`: none, copyright, privacy, unknown
- `verifier_label`: accept, reject_solver_conflict, reject_source_framing, reject_privacy, reject_copyright, reject_too_generic

## Split Policy

Use deterministic split by stable row id:

- train: 70%
- dev: 15%
- test: 15%

Keep prompt families together when a family id exists. Culture follow-up cases and verifier rejection cases should not leak across splits.

## Metrics

Required before runtime consideration:

- domain accuracy >= 0.95
- task_type accuracy >= 0.95
- question_type accuracy >= 0.9
- operation accuracy >= 0.9
- answer_policy accuracy >= 0.95
- privacy/copyright recall = 1.0 on public runtime rows
- source-framing false negative count = 0
- private/public visibility violation count = 0
- reasoning accuracy drop after gate <= 2%

## Runtime Readiness

The trained gate is not ready for runtime unless:

- all R9/R10/R11 strict evals still pass;
- culture card, persona privacy, persona overfit, personal fact, and trace-training validators pass;
- full `npm run check` passes;
- no generated weights or checkpoints are committed;
- `web/tiny_router_model.generated.js` remains unchanged unless a later approved phase explicitly replaces it;
- the gate improves routing/verifier selection without changing public answer content by itself.

## Report Requirements

Any future dry-run should write only a report under `artifacts/training_os/`:

- train/dev/test counts
- labels per head
- metrics per head
- confusion highlights
- failure examples
- readiness decision
- confirmation that no weights were committed

## Current Decision

R10/R11 stops at validated trace-labeled data. The existing tiny-router training script is not a suitable controlled reasoning gate trainer because it targets the browser router artifact and generated runtime model. A later phase should add a separate experimental trainer that writes ignored metrics artifacts only.
