# Public Encyclopedia Data Strategy

Baseline: `a30c3eea581304c3b0866336e41cc80aa44942cc`

This strategy replaces manual common-knowledge card authoring with a provenance-aware ingestion layer. It does not change conversational routing, surface realization, `answerIndex`, `tiny_router_model.generated.js`, existing eval expectations, or hidden-review data.

## Source Classes

| Source class | Purpose | Runtime authority |
| --- | --- | --- |
| `canonical_structured_data` | Stable identifiers, labels, aliases, typed relations, dates, countries, languages, sitelinks. | May feed compact canonical graph shards after license/provenance validation. |
| `licensed_text_corpus` | Licensed passages used as evidence text, never handwritten semantic summaries. | May feed passage shards with attribution/share-alike tracking; not merged into CC0 graph records. |
| `qa_training_data` | Grounded answer extraction, answerability, no-answer behavior. | Training/evaluation only; never runtime rules. |
| `retrieval_training_data` | Retrieval/reranking examples and relevance labels. | Training/evaluation only; never user-visible canned answers. |
| `public_evaluation_data` | Public benchmark regression checks. | Diagnostic only; not product acceptance. |
| `product_specific_overlay` | Project-specific bridges, comparisons, safety/policy rules. | Optional overlay; must never overwrite canonical facts. |

## Canonical And Interpretive Separation

`canonical_fact` is a neutral public fact with source and revision provenance.

`canonical_definition` is a neutral sourced description or definition with license and attribution metadata.

`project_interpretive_overlay` is optional project-specific comparison or bridge text. Most ordinary entities should not have one.

`policy` is internal behavior or safety logic and is not knowledge about the entity.

A project interpretation must never overwrite a canonical fact. If both exist, the runtime pack records both separately and the answer planner must know which authority it is using.

## Primary Sources

Wikidata is the preferred `canonical_structured_data` source. It may provide QIDs, Chinese/English/original labels, aliases, descriptions, occupations, entity types, dates, country/language metadata, relationships, movement/genre links, and Wikipedia sitelinks. Only allowlisted properties are imported; arbitrary claims stay out until mapped with provenance.

Wikimedia dumps are `licensed_text_corpus`. Chinese and English Wikipedia are separate corpora. Each passage record must carry page title, language, page ID, revision ID or dump version, section, source URL, license, and linked Wikidata QID. CC BY-SA/GFDL text remains separate from CC0 graph records.

MusicBrainz core data is `canonical_structured_data` for artists, works, recordings, releases, release groups, aliases, and relationships. Supplementary data, live data feed, annotations, tags, cover art, and user prose are excluded by default.

OpenAlex is `canonical_structured_data` for scholarly works, authors, institutions, topics, publication relationships, and identifiers. It is bibliographic metadata, not scientific truth.

## Pilot Scope

The pilot is an ingestion inventory and offline pack plan for 12,000 Wikidata entities, selected by domain sampling rather than hidden-prompt entities:

| Domain | Target QIDs | Wikipedia passage target | Notes |
| --- | ---: | ---: | --- |
| literature | 1,500 | 1,000 zh + 1,000 en | people, works, movements |
| music | 1,400 | 800 zh + 800 en | people, groups, works; crosswalk MusicBrainz when available |
| film | 1,200 | 700 zh + 700 en | people, films, studios, movements |
| art/design | 1,200 | 700 zh + 700 en | artists, designers, movements, institutions |
| philosophy | 900 | 500 zh + 500 en | people, schools, concepts |
| science | 1,200 | 700 zh + 700 en | scientists, concepts, institutions |
| technology | 1,000 | 600 zh + 600 en | computing, engineering, protocols |
| city | 900 | 500 zh + 500 en | places with stable identifiers |
| food | 700 | 400 zh + 400 en | cuisines, foods, techniques |
| economy | 900 | 500 zh + 500 en | economists, institutions, concepts |
| law/education boundary concepts | 1,100 | 600 zh + 600 en | law, education, rights, methods |

Most imported records remain `source_only`. A record becomes runtime-eligible only after license, provenance, quality, and pack-size gates pass.

## Quality Gates

Reject or quarantine records with missing license, missing provenance, disambiguation/list pages, low-information stubs, duplicate aliases, unresolved entity IDs, unsupported language, current-sensitive undated claims, long copyrighted text, raw HTML/wikitext leakage, method/policy prose, or answer snippets.

## Offline Outputs

The offline build produces compact canonical graph shards, passage shards, retrieval index shards, license/provenance manifests, and optional domain packs. The browser runtime loads only selected compact packs. Full Wikipedia, full Wikidata, full OpenAlex, and full MusicBrainz dumps are never serialized into JavaScript.

## Governance

Public benchmarks are regression and training resources, not independent product acceptance. The project must not modify official test data, merge train/dev/test, use public test questions as runtime branches, use test labels as training, or claim benchmark success proves natural conversation quality. User-owned hidden review remains separate.

