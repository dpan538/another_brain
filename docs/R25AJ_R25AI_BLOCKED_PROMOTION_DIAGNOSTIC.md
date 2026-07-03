# R25AJ R25AI Blocked Promotion Diagnostic

R25AI blocked before promotion because R25AH candidate targets collapsed to too few unique answers. R25AJ records the blocker and repairs candidate generation under ignored artifacts only. It does not train, does not promote rows, and does not modify `training/llm_corpus`.

## Aggregate Findings

- Old R25AH candidates: 440
- Raw unique target answers: 20
- Normalized unique target answers: 20
- Unique train/dev/heldout-candidate targets: 20/9/7
- Duplicate clusters: 20
- Failed R25AI report present: yes
- Failed R25AI promoted rows: 0

## Root Cause

The blocker is target-generator template collapse: rows varied metadata and source references, but the actual `target_answer` text repeated across many rows. The source catalog itself was broad enough; the answer generator did not bind enough source-specific context, task framing, or response obligation into each target.

R25AJ therefore adds a review rubric, a normalized uniqueness check, and a repaired deterministic generator that creates context-specific target answers without appending meaningless IDs.
