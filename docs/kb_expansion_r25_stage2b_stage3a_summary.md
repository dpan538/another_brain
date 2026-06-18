# KB Expansion R25 Stage 2B + Stage 3A Summary

## Boundary

This round updates KB source cards, pack governance metadata, KB audits, docs, and the deterministic generated culture-card artifact only. It does not repair routing, referent binding, R23 candidate logic, surface realization, answerIndex, tiny-router weights, eval rows, or thresholds.

## Baseline And Final Counts

- Baseline commit: acd2eaf
- Baseline source cards: 725
- Baseline public runtime source cards: 562
- Baseline generated runtime cards: 561
- Final source cards: 1269
- Final public runtime source cards: 1006
- Final generated runtime cards: 1005
- Final core default count: 444
- Added/materially new R25 cards: 544
- Added by type: concept=94, person=45, relation=315, work=90
- Added by runtime scope: boundary_pack=60, bridge_pack=207, domain_pack=177, source_only=100
- Added by pack: boundary_safety_core=17, bridge_cross_domain=118, bridge_cross_domain_source=100, city_food_daily_core=65, education_learning_core=35, law_care_boundary_core=59, science_economy_tech_core=150
- Added relation/contrast/boundary share: 0.675

## Runtime Pack Governance

- Active runtime scopes used: boundary_pack, bridge_pack, domain_pack, legacy_unassigned
- Authored source scopes used: boundary_pack, bridge_pack, domain_pack, legacy_unassigned, source_only
- Active pack IDs used: boundary_safety_core, bridge_cross_domain, city_food_daily_core, education_learning_core, law_care_boundary_core, legacy_unassigned, science_economy_tech_core
- Authored source pack IDs used: boundary_safety_core, bridge_cross_domain, bridge_cross_domain_source, city_food_daily_core, education_learning_core, law_care_boundary_core, legacy_unassigned, science_economy_tech_core
- Active runtime count is bounded separately from the long-term authored source library.
- The 15,000-card target is treated as a future source-library ceiling, not an active browser payload.

## Generated Runtime Artifact

- Generated file: `web/culture_cards.generated.js`
- Size before R25 baseline: 1649822 bytes
- Size after R25: 3227979 bytes
- Size growth from baseline: 1.957x
- SHA256: b4f4a67c0b1f8d7117b73536cebd1a9573f59bd96b2bdc9358f0126709217139
- Runtime size risk: low

## Closure Metrics

- Relation density: 0.24 -> 0.348
- Person-to-work closure: 0.693 -> 0.788
- Work-to-concept closure: 0.691 -> 0.822
- Concept-to-relation closure: 0.473 -> 0.569
- Missing public person/work/concept references after this round: 0

## Quality Audits

- New-card provenance failures: 0
- New-card transfer_scope failures: 0
- New-card runtime_scope failures: 0
- New-card pack_id failures: 0
- New-card purpose_class failures: 0
- New concept cards missing non_examples/negative_moves: 0
- New work cards missing copyright_boundary: 0
- New relation cards missing licensed_verbs: 0
- New relation cards missing negative_moves: 0
- New-card profile-template hits: 0
- New-card long answer snippet hits: 0

## Method Card Risk

- Public method cards inventoried: 17
- Method cards with medium/high leakage risk: 1
- R25 does not migrate method policy into public semantic cards.

## Domains Still Weak

- Non-Western city theory and everyday urban examples.
- Non-Western science history beyond a small foundation.
- Regional food cultures outside broad taste/process concepts.
- Current legal, medical, financial, travel, product, and platform facts.
- Clinical psychology and crisis support, which remain outside static KB authority.
- Long-tail regional culture packs, which need optional/source-only governance before activation.

## Not Solved By KB Expansion Alone

- wrong_referent: routing/state/reference issue, not solved by KB alone.
- wrong_operation: operation typing/planning issue, not solved by KB alone.
- stale_domain_contamination: state/domain finalizer issue, not solved by KB alone.
- context_lost: discourse memory issue, not solved by KB alone.
- transform_without_semantic_binding: transform-planning issue, not solved by KB alone.
- implementation leakage: runtime finalizer/surface issue, not solved by KB alone.
- generic surface realization: surface issue, not solved by KB alone.
- mechanical reply: surface/evaluation issue, not solved by KB alone.
- false-green diagnostics: evaluation governance issue, not solved by KB alone.
- hidden review failure: not rerun and not repaired by this KB expansion.
- R23 candidate rejection: remains rejected.

## Recommended Next Step

Either continue with Stage 3B pack governance and optional shard design, or run a separate patch-only routing/state/surface task for one explicitly named live failure family. These should not be mixed.
