# KB Expansion Stage 1B + Stage 2A Summary

## Boundary

This round expands public semantic KB cards and deterministic generated KB data only. It does not repair routing, state, transforms, surface realization, R23 candidate logic, eval thresholds, answerIndex, or tiny-router weights.

## Baseline And Final Counts

- Baseline commit: 04296d8
- Baseline public runtime cards from pre-audit: 327
- Final public runtime cards: 562
- Added/materially new Stage 1B/2A cards: 235
- Added by type: concept=93, movement=1, person=24, work=48, relation=69
- Added domains: art_history, design_history, economy, education, film, film.chinese, film.hongkong, film.japanese, film.taiwan, food, law_boundary, literature, literature.chinese_modern, literature.japanese, literature.western_modern, music.chinese_pop_general, music.hongkong, music.mandopop, photography_history, psychology_boundary, relation_graph, science.history, source_sensitive_boundary, technology, urban

## Closure Metrics

- Relation density: 0.202 -> 0.24
- Person-to-work closure: 0.597 -> 0.693
- Work-to-concept closure: 0.493 -> 0.691
- Concept-to-relation closure: 0.229 -> 0.473
- Missing public person/work/concept references after this round: 0

## Quality Audits

- New-card provenance failures: 0
- New-card transfer_scope failures: 0
- New work cards missing copyright_boundary: 0
- New relation cards missing licensed_verbs: 0
- New relation cards missing negative_moves: 0
- New card profile-template hits: 0
- New card long-answer-snippet hits: 0

## Method Card Risks

- Public method cards inventoried: 17
- Method cards with medium/high leakage risk: 1
- This round does not migrate method policy into semantic public cards.

## Domains Still Weak

- non-Western science history
- global South urbanism
- food cultures outside general craft concepts
- current law by jurisdiction
- clinical psychology and crisis support
- contemporary platform technology

## Not Solved By KB Expansion Alone

- wrong_referent: requires routing/state/reference repair.
- stale_domain_contamination: requires state isolation and domain finalizer work.
- context_lost: requires discourse memory repair.
- transform_without_semantic_binding: requires transform logic over semantic records.
- implementation_leakage: requires runtime finalizer/surface work.
- generic surface realization: requires surface realization changes.
- mechanical reply: requires response surface and evaluation governance.
- false-green diagnostics: requires evaluation governance.
- hidden review failure: not rerun and not repaired by KB expansion alone.
- R23 candidate rejection: remains rejected.

## Recommended Next Stage

If runtime can safely consume structured cards, Stage 2B can deepen daily-world coverage and add more negative relation cards. If hidden review remains dominated by wrong referent/domain/surface failures, the next work should be a separate patch-only routing/state/surface repair, not more KB cards.
