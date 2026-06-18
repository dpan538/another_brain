# R28 Post-R27 Structural Audit

Generated before R28 edits. This is an audit of KB structure, not a runtime behavior claim.

## Counts

- source cards: 5717
- active runtime source cards: 1840
- generated runtime cards: 1839
- source_only cards: 3728
- optional_long_tail cards: 149
- blank runtime_scope: 0
- blank pack_id: 0
- legacy_unassigned cards: 0
- active method cards: 0
- active external seed cards: 0
- generated size bytes: 6763539

## Structural Debt

- source orphan counts: {"closed_or_non_anchor":5035,"orphan_concept":47,"orphan_person":67,"orphan_work":95,"relation_missing_endpoint":473}
- active orphan counts: {"closed_or_non_anchor":1840}
- active missing references: 0
- source missing references: 1626
- relation cards with empty source_ids: 32
- relation cards with empty target_ids: 94
- relation cards without licensed verbs: 94
- relation cards without negative_moves: 0
- relation cards without provenance: 0
- duplicate name/title clusters: 200

## Required R28 Action

R28 should normalize pack metadata, decouple active method/external seed cards, close or demote active orphan clusters, add relation endpoints where useful, and keep hidden-review/runtime behavior claims out of the KB reports.
