# R27A P0 Reasoning/RAG/Value/Distillation Architecture

R27A addresses two P0 gaps without training:

- P0-1: the model path lacks a structured reasoning/RAG layer. Static knowledge shards exist, but future drafts need a reasoning plan and evidence packet before answer rendering.
- P0-2: the answer-as-user path lacks explicit value, philosophy, and aesthetic structure. It needs a profile packet so answers can leave rule-like assistant behavior and keep coherent stance.

R27A adds trace-only contracts for `reasoning_plan`, `evidence_packet`, `value_profile_packet`, `answer_obligation`, and optional `teacher_distillation_packet`. R24/R25/R26 recovery gates remain safety harnesses and verifier/fallback layers; they are not the main intelligence layer.

Knowledge shards are evidence sources, not answer banks. Evidence packets carry refs, relation hints, and short snippets only. They must honestly report absent or partial evidence.

Teacher/distillation is an acceleration scaffold, not product replacement. Teacher output is candidate evidence for comparison, not truth and not direct training data. It must be reviewed, provenance-labeled, no-CoT, no-private-data, and transformed before any later training use.

R27A does not train, run tokenizer dry-runs, expand corpus, promote corpus rows, call external APIs, call Doubao, add backend/storage/API paths, commit teacher outputs, commit artifacts, or commit weights. Phase_4 remains blocked.
