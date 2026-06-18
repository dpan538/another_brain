# R28 Large-Scale KB Expansion Summary

R28 expanded and cleaned the KB source library. This document is a KB/data report only; it does not claim runtime conversation behavior is fixed.

## Counts

- baseline source cards: 2676
- final source cards: 5717
- source delta: 3041
- baseline active runtime source cards: 1070
- final active runtime source cards: 1820
- active runtime source delta: 750
- baseline generated runtime cards: 1069
- final generated runtime cards: 1819
- generated artifact size before: 3454705
- generated artifact size after: 6687888
- generated artifact SHA256: 917edc027e56332189143b393090903434baa61d62e61df07965194660664f26
- source-only cards: 3748
- optional long-tail cards: 149

## R28 Additions

- R28 stage cards: 3041
- R28 active stage cards: 819
- R28 relation/contrast/negative/boundary/example share: 0.968
- R28 active relation-like share: 0.991
- cards by type: {"concept":25,"person":16,"relation":2936,"work":64}
- cards by pack: {"art_image_design_architecture":192,"bridge_negative_boundary_layer":695,"city_food_daily_life":224,"economy_law_education_care_boundary":284,"film_media_global_expansion":323,"literature_global_expansion":500,"music_global_and_chinese_completion":302,"philosophy_language_social_thought":77,"r28_active_closure_pruned_source_only":164,"science_technology_computing":280}
- cards by domain family: {"art_image_design_architecture":185,"city_food_daily":221,"economy_law_education_care":289,"film_media":343,"literature":521,"music":305,"philosophy_language_social":142,"science_technology":1035}

## Structural Cleanup

- legacy_unassigned cards after cleanup: 0
- blank runtime_scope after cleanup: 0
- blank pack_id after cleanup: 0
- active method cards after cleanup: 0
- active external seed cards after cleanup: 0
- source orphan counts: {"closed_or_non_anchor":5035,"orphan_concept":47,"orphan_person":67,"orphan_work":95,"relation_missing_endpoint":473}
- active orphan counts: {"closed_or_non_anchor":1819,"orphan_person":1}
- active missing references: 0
- active relation missing endpoints: 0
- duplicate clusters reported: 200

## Relation And Closure

- baseline source relation density: 0.541
- final source relation density: 0.767
- final active relation density: 0.635
- source person-to-work closure: 0.796
- source work-to-concept closure: 0.827
- source concept-to-relation closure: 0.897
- active person-to-work closure: 0.992
- active work-to-concept closure: 1
- active concept-to-relation closure: 1

## Risk Notes

- generated artifact over 6 MB warning: true
- generated artifact over 8 MB stop threshold: false
- no-answer-snippet stage hits: 0
- runtime behavior not claimed fixed
- hidden review not rerun
- R23 candidate remains rejected

## Non-KB Limits

R28 does not solve wrong_referent, wrong_operation, stale_domain_contamination, context_lost, transform_without_semantic_binding, implementation leakage, generic surface realization, mechanical reply, false-green diagnostics, hidden review failure, or R23 candidate rejection. Those remain routing, state, surface, and evaluation issues.

## Recommended R29 Strategy

Use the expanded source library for retrieval/ranking design, then separately repair routing/state/surface in patch-only mode. Keep source-only long-tail packs out of active browser payload until a shard or retrieval layer exists.
