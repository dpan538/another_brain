# Data Card

## Purpose

The project uses local build scripts to generate a short-answer distillation
dataset and public browser artifacts for a local-first dialog runtime.

## Public Data

Public generated files may include:

- `web/knowledge_base.generated.js`
- `web/knowledge_shards/*.json`
- `web/tiny_router_model.generated.js`
- `web/model_inference_cases.json`
- `web/context_stress_cases.json`
- `evals/casepacks/*.json`

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
- Synthetic casepack capability eval.
- Knowledge runtime benchmark.
- Knowledge shard validation.
- Training OS validation.

The release gates are not proof of general intelligence. The synthetic casepack
gate now scores routing, evidence sufficiency, privacy behavior, distractor
handling, contradiction handling, and short-answer style, but it should still be
expanded with harder held-out case families before claiming broad reasoning
ability.
