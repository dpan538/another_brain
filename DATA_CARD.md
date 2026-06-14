# Data Card

## Purpose

The project uses local build scripts to generate a short-answer distillation
dataset and public browser artifacts for a local-first dialog runtime.

## Public Data

Public generated files may include:

- `web/knowledge_base.generated.js`
- `web/tiny_router_model.generated.js`
- `web/model_inference_cases.json`
- `web/context_stress_cases.json`

These files are generated for this project and are covered by the repository
license.

## Private Data

Private data is not distributed:

- `artifacts/**`
- `web/brain_pack.js`
- local memory packs
- drive inventories
- source-material inventories
- source PDFs and images
- model checkpoints and LoRA adapters
- local model weights

## Current Dataset Snapshot

- Distillation rows: 74,593.
- Train rows: 72,808.
- Eval rows: 1,785.
- Cloud teacher used: false.
- Source files copied into public runtime: false.
- Private paths allowed in public runtime: false.

## Evaluation

Current public gates include:

- Dialog persona eval.
- Tiny router route and answer eval.
- Model gate.
- Context stress eval.
- Knowledge runtime benchmark.
- Training OS validation.

The existing gates are release gates, not proof of general intelligence. Future
casepack evaluations should score routing, evidence sufficiency, groundedness,
privacy behavior, contradiction handling, and multi-turn state accuracy.
