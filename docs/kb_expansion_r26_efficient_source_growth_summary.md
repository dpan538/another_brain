# KB Expansion R26 Efficient Source Growth Summary

## Boundary

R26 updates KB source cards, pack governance reports, audit/generation scripts, docs, and the deterministic generated culture-card artifact only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Counts

- Baseline commit: 6ba9e7965612b03b59c416ec4da63f7f066685b9
- Source cards: 1269 -> 2074
- Active runtime source cards: 1006 -> 1033
- Generated runtime cards: 1005 -> 1032
- Source-only cards: 878
- Optional long-tail cards: 0
- Core/default cards: 444
- R26 stage cards: 805
- R26 added by type: concept=61, person=72, relation=525, work=147
- R26 added by runtime scope: boundary_pack=19, domain_pack=8, source_only=778
- R26 added by pack: art_design_image_deepening=96, bridge_negative_boundary_layer=74, city_food_daily_extension=20, economy_law_education_care_boundary=15, global_cinema_extension=162, global_music_culture=134, philosophy_language_social_thought=75, science_computing_history_extension=40, world_literature_extension=189

## Runtime Size

- Generated artifact: `web/culture_cards.generated.js`
- Size before R26: 3227979 bytes
- Size after R26: 3322701 bytes
- Size ratio vs pre-R24 baseline: 2.014
- SHA256: fdd5ae9c4076efffefceacc83304993fe86b7c2236467d3c17dc9174a584d30f
- Runtime size risk: low

## Closure

- Active relation density: 0.348 -> 0.349
- Active person-to-work closure: 0.788 -> 0.788
- Active work-to-concept closure: 0.822 -> 0.822
- Active concept-to-relation closure: 0.569 -> 0.585
- Missing public person/work/concept references: 0

## Quality

- New-card profile-template hits: 0
- New-card long final-answer hits: 0
- New-card provenance failures: 0
- New-card transfer_scope failures: 0
- New active runtime growth was controlled by keeping most dense expansion cards source-only or optional.

## Domains Still Weak

- Fine-grained regional culture packs remain sparse.
- Current law, medical, finance, travel, product, and platform facts remain outside static KB authority.
- Clinical psychology and crisis response remain boundary-heavy and not solved by cards.
- Runtime routing/state/surface failures remain outside this KB-only work.

## Not Solved By KB Expansion Alone

- wrong_referent: routing/state/reference issue.
- wrong_operation: operation typing/planning issue.
- stale_domain_contamination: state/domain finalizer issue.
- context_lost: discourse memory issue.
- transform_without_semantic_binding: transform planning issue.
- implementation leakage: runtime finalizer/surface issue.
- generic surface realization: surface issue.
- mechanical reply: surface/evaluation issue.
- false-green diagnostics: evaluation governance issue.
- hidden review failure: not rerun.
- R23 candidate rejection: remains rejected.

## Recommended R27 Strategy

Continue source-only pack growth only if a shard/lazy-load plan is defined, or switch to a separate patch-only routing/state/surface repair for one explicit live failure family. Do not mix KB expansion with runtime behavior claims.
