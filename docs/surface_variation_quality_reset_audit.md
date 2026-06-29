# Surface Variation Quality Reset Audit

Baseline: `a30c3eea581304c3b0866336e41cc80aa44942cc`

Branch: `main`

`origin/main`: `a30c3eea581304c3b0866336e41cc80aa44942cc`

## Scope

This reset rejects the current controlled-variation strategy as incomplete. The live candidate generator in `web/controlled_surface_variation.js` operates from already-rendered visible answers, then splits, rejoins, rotates, or prefixes that surface text. That is not semantic-plan-first variation.

The task-local user file `docs/session_level_ux_metrics.md` is classified as `user_local` and was not inspected.

## Current Diff Classes

- `variation_core`: `web/controlled_surface_variation.js`, surface-history integration in `web/conversation_controller.js`, `scripts/surface_variation/*`, `artifacts/surface_variation/*`, and surface review docs.
- `diagnostic_only`: targeted surface-variation matrix, browser harness, review packet generator, and preference-pair schema.
- `ingestion_unrelated`: `.gitignore`, ingestion scripts, public-knowledge runtime pack files, data-ingestion schemas, and public encyclopedia docs/artifacts.
- `release_chasing_unrelated`: broad changes in `web/dialog_rules.js`, `web/dialogic_bridge_runtime.js`, `web/operation_layer.js`, `web/culture_planner.js`, `web/culture_runtime.js`, `web/conversation_state_schema.js`, `web/coverage_gate.js`, `web/response_mode_manager.js`, and `scripts/check_conversation_controller_coverage.mjs`.
- `generated_churn`: `evals/r21_control_families/manifest.json`.
- `user_local`: `docs/session_level_ux_metrics.md`, local `.docx`/PDF files, and unrelated external reasoning dataset files.

## Rejected Candidate Strategy

The current implementation does not count as controlled semantic diversity because it:

- uses the rendered final answer as primary content authority;
- creates candidates by punctuation and clause separator changes;
- adds generic repetition wording such as `同一个方向：`;
- counts punctuation/order-only variants as separate candidates;
- verifies preservation against the visible source answer rather than against mandatory semantic units.

These candidate families are rejected:

- punctuation-only difference;
- semicolon/period/comma alternation;
- clause-order-only difference without a meaningful focus change;
- generic introductory cue insertion;
- full or partial surface templates such as `可以抓三点：...` and `同一个方向：...`.

## Reset Plan

1. Restore generated/check churn and unrelated release-chasing changes after this inventory.
2. Keep only narrow variation infrastructure: surface history, deterministic seed, semantic signature, trace schema, skeleton diagnostics, targeted diagnostic harness, review packet generator, and preference-pair schema.
3. Replace rendered-answer candidate generation with plan-first candidate generation.
4. Add semantic-effective candidate deduplication so punctuation/order-only candidates collapse before reporting `candidate_count`.
5. Run the small 60-prompt targeted gate only. Do not run the full browser matrix or release suite.

## Completion Boundary

The reset stops at a human-review gate. Passing targeted diagnostics will not be reported as naturalness acceptance.
