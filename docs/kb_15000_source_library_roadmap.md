# 15,000-Card Source Library Roadmap

## Status

The 15,000-card number is a long-term upper bound for an authored source library, not a browser runtime target. R25 keeps the active public runtime bounded and introduces pack governance so future growth can separate source coverage from default local-first payload.

## Three Counts

- Authored source count: every card in `data/culture_cards/*.jsonl`.
- Active runtime count: cards emitted into `web/culture_cards.generated.js`.
- Core default count: the compact high-transfer substrate that should remain safe for default local-first use.

## Pack Hierarchy

| Pack | Source Target | Active Default Target | Relation Density Target | Runtime Suitability | Risk |
| --- | ---: | ---: | ---: | --- | --- |
| core_public_runtime | 700-1,000 | 500-750 | >=0.25 | default | stale surface if prose leaks |
| arts_humanities_core | 1,500-2,000 | 250-450 | >=0.30 | domain shard | canon bias |
| literature_global | 1,500-2,500 | 200-400 | >=0.30 | optional shard | copyright/quotation risk |
| film_media | 1,200-1,800 | 180-350 | >=0.30 | optional shard | plot-summary bloat |
| music_culture | 1,000-1,500 | 150-300 | >=0.30 | optional shard | lyric/copyright risk |
| art_design_image | 1,000-1,500 | 150-300 | >=0.30 | optional shard | image-rights confusion |
| philosophy_language | 900-1,400 | 120-250 | >=0.35 | optional shard | abstraction overload |
| city_food_daily_life | 1,000-1,700 | 150-300 | >=0.30 | optional shard | current recommendation drift |
| science_history | 1,000-1,500 | 120-240 | >=0.30 | optional shard | current science overreach |
| economy_law_institutions | 1,000-1,700 | 120-240 | >=0.35 | boundary-heavy shard | advice/forecast/legal risk |
| psychology_care_boundary | 800-1,200 | 100-180 | >=0.35 | boundary-heavy shard | diagnosis/therapy risk |
| education_learning | 700-1,200 | 100-180 | >=0.30 | optional shard | child/special-needs advice risk |
| technology_interface | 1,000-1,500 | 140-260 | >=0.30 | optional shard | current product/API drift |
| regional_culture_optional | 1,000-2,000 | 0-200 | >=0.25 | opt-in only | coverage imbalance |
| long_tail_specialist_optional | 2,000-4,000 | 0-100 | >=0.25 | source-only or retrieval | bundle and provenance risk |

## Governance Requirements

- Every card needs provenance, transfer_scope, negative or boundary material, and a purpose class.
- Relation, contrast, negative, and boundary cards should grow faster than identity cards.
- Optional long-tail cards should not be active by default.
- Runtime bundle size must be reported every time generated cards change.
- Full final-answer prose, prompt answers, hidden review material, and surface templates are not valid KB content.
- Source-only cards need a future retrieval or sharding path before runtime activation.

## Stop Conditions

- Generated runtime count exceeds 1,200 without explicit pack filtering.
- Generated artifact grows more than 2x from the active baseline without a size-risk report.
- Relation density declines materially while identity/work cards grow.
- New cards lack provenance or negative moves.
- New source cards start encoding answers instead of reusable primitives.
