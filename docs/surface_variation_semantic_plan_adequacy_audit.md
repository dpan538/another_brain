# Surface Variation Semantic-Plan Adequacy Audit

Baseline: `a30c3eea581304c3b0866336e41cc80aa44942cc`

This audit resets the targeted surface-variation diagnostics before human review. It does not integrate variation into the live controller and does not modify release checks, eval rows, thresholds, KB cards, answer indexes, or hidden prompts.

## Frozen Baseline

The prior 26 one-candidate rows were frozen in:

- `artifacts/surface_variation/one_candidate_baseline_frozen.json`

Checksum:

- `2a0c63b52a8a41755b2c06b202965374f787e7bf799cddc7380474cf2cc6deb0`

The frozen rows remain documented even when their prompt generation was invalid.

## Diagnostic Validity

Original 26-row baseline:

- Type mismatches: 0
- Malformed double-question prompts: 1
- Method/policy cards included: 1
- Invalid prompt rows: 2

Repaired targeted set:

- Type mismatches: 0
- Malformed double-question prompts: 0
- Method/policy cards included: 0
- Invalid prompt rows: 0

Original invalid rows:

- `语言会背叛意思吗是什么意思？`: malformed double-question prompt.
- `艺术史应该从哪里开始是什么意思？`: method/policy-style card entered the matrix.

## Baseline Adequacy

Targeted revalidation:

- Prompts tested: 46
- Original one-candidate rows retained: 26
- Corrected replacements and controls: 20
- Baseline-invalid rows: 0
- Wrong entity: 0
- Wrong operation: 0
- Vague comparison answers: 0
- Tautological definitions: 0
- Raw English/internal leakage: 0
- Punctuation-only candidate pairs: 0
- Missing candidate lifecycle traces: 0

## One-Candidate Reclassification

Current one-candidate classifications:

- `candidate_generator_gap`: 4
- `current_retrieval_missing_support`: 2
- `effective_candidate_deduplication`: 3

The old `genuinely_insufficient_supported_content` label is no longer used. One-candidate status is not treated as success by itself; each row depends on prompt validity, baseline answer adequacy, and lifecycle evidence.

## Candidate Lifecycle

Each targeted row now records:

- `plan_id`
- `planned_candidate_outlines`
- `generated_candidates`
- `effective_dedup_groups`
- `verifier_rejections`
- `rejection_reasons`
- `surviving_candidates`
- `selected_candidate`

Rows without a surviving candidate still retain lifecycle evidence and are reported separately from valid one-candidate rows.

## Review Packet

New packet:

- `artifacts/surface_variation/human_review_packet.json`

Contents:

- Multi-candidate items: 20
- Intentional one-candidate items: 5
- Automated preference labels: false
- Hidden prompts used: false
- `user_review_status=pending`

This packet is prepared for targeted human review, not proof of naturalness.
