# KB Expansion R27 Inventory-First Source Growth Summary

## Boundary

R27 is KB/data/inventory/generation work only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Phase A Inventory

- Full source inventory: `artifacts/training_os/kb_expansion/r27_full_source_inventory.json`
- Active runtime inventory: `artifacts/training_os/kb_expansion/r27_active_runtime_inventory.json`
- Source-only inventory: `artifacts/training_os/kb_expansion/r27_source_only_inventory.json`
- Gap map: `artifacts/training_os/kb_expansion/r27_gap_map.json`
- Human-readable docs: `docs/kb_inventory_r27_*.md`, `docs/kb_gap_map_r27.md`

## Counts

- Baseline commit: 6d1f7a16a5178282e93e4a735e30f8fe161d4534
- Source cards: 2074 -> 2676
- Active runtime source cards: 1033 -> 1070
- Source-only cards: 1294
- Optional long-tail cards: 149
- Generated runtime cards: 1032 -> 1069
- Generated artifact size: 3322701 -> 3454705 bytes
- Generated SHA256: 46e4d05cc0ea342bd80c0844f59d3fed195a0689a37250f25a62a2d78ab81cb8
- Generated ratio vs pre-R24 baseline: 2.094

## R27 Added Cards

- Stage cards: 602
- Added by type: concept=42, person=48, relation=411, work=101
- Added by pack: art_design_image_deepening=2, bridge_negative_boundary_layer=105, city_food_daily_extension=67, economy_law_education_care_boundary=24, global_cinema_extension=115, global_music_culture=86, science_computing_history_extension=51, world_literature_extension=152
- Added by runtime scope: boundary_pack=37, optional_long_tail=149, source_only=416
- Relation/contrast/boundary share: 0.718

## Active Additions And Reasons

- relation.r27_bridge.concept_explanation_not_advice.example_not_precedent: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.rule_not_answer.example_not_precedent: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.interface_not_visual_styling.interface: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.public_space_not_travel_advice.public_space: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.market_not_society.market: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.model_not_reality.evidence_not_anecdote: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.recommendation_criterion.representative_work_spine: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.false_equivalence_guard.analogy_not_identity: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.documentary_ethics.documentary_fiction_boundary: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.archival_image.image_not_evidence: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.close_reading.example_not_precedent: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.comparative_literature.translation_equivalence_boundary: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.lyric_subject.song_poem_boundary: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.city_walk.public_space_not_travel_advice: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.care_boundary_static_card.memory_not_diagnosis: adds_boundary_guardrail;prevents_false_equivalence
- relation.r27_bridge.source_library_pack.active_loaded_pack: adds_boundary_guardrail;prevents_false_equivalence
- concept.rule_not_answer: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.interface_not_visual_styling: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.public_space_not_travel_advice: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.market_not_society: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.food_taste_not_nutrition: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.evidence_not_anecdote: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.model_not_reality: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.recommendation_criterion: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.representative_work_spine: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.false_equivalence_guard: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.example_not_precedent: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.archival_image: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.city_walk: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.care_boundary_static_card: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.memory_not_diagnosis: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.source_library_pack: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.active_loaded_pack: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.documentary_ethics: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.close_reading: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.comparative_literature: adds_boundary_guardrail;supports_false_equivalence_rejection
- concept.lyric_subject: adds_boundary_guardrail;supports_false_equivalence_rejection

## Closure

- Source-library relation density: 0.5 -> 0.541
- Source-library person-to-work closure: 0.574 -> 0.639
- Source-library work-to-concept closure: 0.63 -> 0.674
- Source-library concept-to-relation closure: 0.68 -> 0.712
- Active relation density: 0.35 -> 0.352
- Missing public person/work/concept references: 0

## Quality

- New-card profile-template hits: 0
- New-card long final-answer hits: 0
- New-card provenance failures: 0
- New-card transfer_scope failures: 0

## Remaining High-Priority Gaps

- Some legacy cards remain without pack metadata because R27 did not rewrite old cards.
- Some source-only long-tail packs need future sharding/lazy-load governance before active use.
- Fine-grained regional culture and contemporary domains remain intentionally source-library work, not active runtime proof.

## Non-KB Limits

- wrong_referent: routing/state/reference issue, not solved by KB expansion alone.
- wrong_operation: operation typing/planning issue, not solved by KB expansion alone.
- stale_domain_contamination: state/domain finalizer issue, not solved by KB expansion alone.
- context_lost: discourse memory issue, not solved by KB expansion alone.
- transform_without_semantic_binding: transform planning issue, not solved by KB expansion alone.
- implementation leakage: runtime finalizer/surface issue, not solved by KB expansion alone.
- generic surface realization: surface issue, not solved by KB expansion alone.
- mechanical reply: surface/evaluation issue, not solved by KB expansion alone.
- false-green diagnostics: evaluation governance issue, not solved by KB expansion alone.
- hidden review failure: hidden review was not rerun.
- R23 candidate rejection: remains rejected.

## Recommended R28 Strategy

Either continue source-library growth only after a shard/lazy-load design is implemented, or switch to a separate patch-only routing/state/surface repair for one explicit live failure family. Do not use KB audits as conversational acceptance.
