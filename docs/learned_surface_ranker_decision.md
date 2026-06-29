# Learned Surface Ranker Decision

Status: deterministic controlled variation implemented; learned ranking not started.

## Evidence Used

- Correctness baseline: `artifacts/surface_variation/phase2_correctness_validation.json`
- Runtime variation matrix: `artifacts/surface_variation/variation_matrix_report.json`
- Real-browser variation transcripts: `artifacts/surface_variation/browser_variation_transcripts.json`
- Preference data inventory: `artifacts/surface_variation/preference_data_inventory.json`

## Current Result

The real-browser matrix covered 358 prompts and 2,864 browser turns. Hard failures were zero for the automated gates: wrong entity, wrong operation, wrong domain, implementation leakage, raw English leakage, generic profile answer, unsupported fact, and stale-state contamination.

Controlled variation produced multiple exact and skeleton variants for 261 prompts. The remaining 97 prompts repeated in the same session because the system only had one safe realization under the current semantic plan and candidate rules.

The same-session exact-repeat rate and skeleton-repeat rate are both 0.2709 over the full frozen matrix. Those residual repeats are not treated as failures by themselves, because forced diversity would be worse than preserving entity, operation, fact, uncertainty, and boundary.

## Human Review Readiness

The review packet contains 80 blind review items:

- `artifacts/surface_variation/human_review_packet.json`
- `artifacts/surface_variation/human_review_mapping_private.json`
- `docs/surface_variation_review_instructions.md`

The future preference dataset contains 240 unlabeled candidate pairs:

- `artifacts/surface_variation/preference_pair_schema.json`
- `artifacts/surface_variation/preference_candidate_pairs.jsonl`

Human preference labels available: 0.

Hidden prompts used: no.

QLoRA started: no.

## Decision

Conclusion D: insufficient preference data; collect human labels first.

The deterministic layer is sufficient to prepare for human review, but it is not enough evidence to claim naturalness has passed. A learned pairwise ranker should be researched only after the blind review packet has enough reliable labels. Bounded SFT or QLoRA should not be chosen in this task.

## QLoRA Gate

QLoRA remains out of scope until all of the following exist:

- explicit base model and license
- browser/runtime budget
- parameter target
- high-quality preference or SFT data
- scenario-family splits
- private holdout
- safety-boundary separation
- measurable target failure class
