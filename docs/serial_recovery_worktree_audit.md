# Serial Recovery Worktree Audit

Generated: 2026-06-19T09:52:51.352Z

Branch: main

HEAD: a30c3eea581304c3b0866336e41cc80aa44942cc

origin/main: a30c3eea581304c3b0866336e41cc80aa44942cc

Baseline: a30c3eea581304c3b0866336e41cc80aa44942cc

## Status

```
 M .gitignore
 M docs/session_level_ux_metrics.md
 M package.json
 M web/culture_planner.js
 M web/dialogic_bridge_runtime.js
 M web/operation_layer.js
?? "Another Brain product and training-system audit.docx"
?? Church.pdf
?? "Designing Capability-Centered Knowledge Expansion for another_brain.docx"
?? "Dialogue Boundary, Contextual Questioning, Turn-Taking, and Response Mode Contract for a Personal Mi.docx"
?? Poetry_Collection.pdf
?? "Reframing another_brain.docx"
?? "Toward a Natural Conversational Surface for another_brain.docx"
?? "Why another_brain Answer Machine failed in R23 hidden review and what to redesign next.docx"
?? "another_brain Public Runtime KB Expansion Blueprint.docx"
?? "another_brain \344\270\252\344\272\272\350\203\214\346\231\257\346\221\204\345\217\226\344\270\216\344\272\272\346\240\274\345\261\202\350\256\255\347\273\203\346\226\271\346\241\210.docx"
?? "another_brain \347\232\204\346\226\207\345\214\226\347\237\245\350\257\206\344\270\216\345\270\270\350\257\206\346\213\223\345\261\225\347\263\273\347\273\237\346\226\271\346\241\210.docx"
?? "another_brain \350\207\252\347\204\266\350\257\255\350\250\200\347\220\206\350\247\243\346\216\250\347\220\206\345\261\202\343\200\201\345\217\215\351\246\210\346\250\241\345\274\217\343\200\201WebGPU \350\277\220\347\224\250\344\270\216\346\234\200\347\273\210\350\264\237\350\275\275\346\240\207\345\207\206\347\240\224\347\251\266.docx"
?? data/external_sources/reasoning_dataset_registry.jsonl
?? docs/public_dataset_license_registry.md
?? docs/public_encyclopedia_data_strategy.md
?? docs/r23_knowledge_substrate_taxonomy.md
?? docs/reasoning_dataset_license_audit.md
?? schemas/
?? scripts/data_ingestion/
?? scripts/discover_reasoning_datasets.mjs
?? scripts/import_admitted_reasoning_dataset_samples.mjs
?? scripts/validate_admitted_reasoning_samples.mjs
?? scripts/validate_reasoning_dataset_licenses.mjs
?? web/public_knowledge_pack.generated.js
?? web/public_knowledge_runtime.js
?? "\344\270\272 another_brain \350\256\276\350\256\241\347\234\237\346\255\243\345\217\257\350\220\275\345\234\260\347\232\204\350\257\255\350\250\200\346\216\250\347\220\206\345\261\202.docx"
```

## Diff Stat

```
 .gitignore                       |  3 ++
 docs/session_level_ux_metrics.md |  9 +++++
 package.json                     |  9 ++++-
 web/culture_planner.js           | 12 +++----
 web/dialogic_bridge_runtime.js   | 10 ++++++
 web/operation_layer.js           | 78 ++++++++++++++++++++++++++++++++++++++++
 6 files changed, 113 insertions(+), 8 deletions(-)
```

## Classification

| File | Status | Classification | Rationale |
|---|---|---|---|
| .gitignore | modified | keep_candidate | Keeps generated public ingestion outputs ignored; low risk and task-related. |
| package.json | modified | keep_candidate | Adds reproducible ingestion/runtime-pack scripts; validate after Phase 1. |
| web/culture_planner.js | modified | keep_candidate | Generalized direct-answer cleanup; inspect in Phase 2 after corpus freeze. |
| web/dialogic_bridge_runtime.js | modified | keep_candidate | Generic direct-knowledge guard; inspect in Phase 2. |
| web/operation_layer.js | modified | quarantine_for_later | Contains public knowledge bridge while corpus/index/browser validation incomplete; decide in Phase 2. |
| docs/session_level_ux_metrics.md | modified | user_local_do_not_touch | Explicit user-local file; not read or edited. |
| scripts/data_ingestion/run_public_ingestion_long_cycle.mjs | untracked | keep_candidate | Core ingestion/audit/index/benchmark orchestrator; Phase 1 dependency. |
| scripts/data_ingestion/rebuild_wikipedia_passages.mjs | untracked | quarantine_for_later | API-based recovery path hit throttling; keep for reference, do not use as final path without review. |
| scripts/data_ingestion/rebuild_wikipedia_from_multistream.mjs | untracked | keep_candidate | Official multistream extraction path used for current corpus; Phase 1 audit needed. |
| scripts/data_ingestion/build_public_runtime_pack.mjs | untracked | quarantine_for_later | Runtime-pack builder depends on final frozen corpus; not validated yet. |
| web/public_knowledge_runtime.js | untracked | quarantine_for_later | Runtime bridge was added before corpus/index/browser validation; inspect in Phase 2. |
| web/public_knowledge_pack.generated.js | untracked | generated_only | Generated/stub runtime pack; do not treat as authoritative until Phase 2. |
| docs/public_encyclopedia_data_strategy.md | untracked | keep_candidate | Planning/governance doc from ingestion work. |
| docs/public_dataset_license_registry.md | untracked | keep_candidate | Dataset/license governance doc. |
| schemas/data_ingestion | untracked | keep_candidate | Data ingestion schemas if present. |
| artifacts/data_ingestion | ignored/generated | generated_only | Generated manifests, reports, and audit artifacts. |
| data/public_ingestion/generated | ignored/generated | generated_only | Generated corpus/cache/index shards. |

## Generated Data Sizes

| Path | Bytes |
|---|---:|
| artifacts/data_ingestion | 7585178 |
| data/public_ingestion/generated | 621941594 |
| data/public_ingestion/generated/source/wikimedia_multistream | 324910078 |
| data/public_ingestion/generated/canonical_graph | 14980288 |
| data/public_ingestion/generated/passages_zh | 5576371 |
| data/public_ingestion/generated/passages_en | 14041383 |
| data/public_ingestion/generated/index | 37863964 |

## User-Local Protection

`docs/session_level_ux_metrics.md` is classified as `user_local_do_not_touch`; it was not read, edited, staged, restored, moved, or deleted in Phase 0.

## Phase 0 Decision

No files are discarded in Phase 0. Runtime bridge files are quarantined for Phase 2 decision after the corpus/index freeze.
