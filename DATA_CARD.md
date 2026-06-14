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
- `evals/clone_logic_ethics/*.jsonl`
- `evals/clone_logic_ethics/*.md`
- `identity_pack/identity_surface_contract.md`
- `identity_pack/schemas/*.json`
- `identity_pack/cards/seed_identity_cards.jsonl`
- `identity_pack/interview_question_bank.md`

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
- raw identity interview answers
- unredacted identity/background cards
- model checkpoints and LoRA adapters
- local model weights

## Current Dataset Snapshot

- Distillation rows: 76,365.
- Train rows: 74,580.
- Eval rows: 1,785.
- Cloud teacher used: false.
- Source files copied into public runtime: false.
- Private paths allowed in public runtime: false.

## Evaluation

Current public gates include:

- Dialog persona eval.
- Tiny router route and answer eval.
- Model gate.
- Help/onboarding and surface-identity gate coverage.
- Context stress eval.
- Synthetic casepack capability eval.
- Clone logic/ethics held-out stress eval.
- Knowledge runtime benchmark.
- Knowledge shard validation.
- Training OS validation.
- Identity Pack validation.

The release gates are not proof of general intelligence. The synthetic casepack
gate now scores routing, evidence sufficiency, privacy behavior, distractor
handling, contradiction handling, and short-answer style, but it should still be
expanded with harder held-out case families before claiming broad reasoning
ability.

The clone logic/ethics v0.1 casepacks are held-out evaluation assets. They are
real-event-derived and intended to test bounded dialog-surface judgment under
pressure: fact/inference separation, layered responsibility, uncertainty,
ethical sensitivity, and clone voice. They are not distillation data and must
not be used for training until verified evidence cards and a split policy exist.

The public Identity Pack is a scaffold and safe seed set, not a complete
identity dataset. Raw interview answers and unredacted cards must remain local
until each card is cleaned, assigned visibility, and checked for forbidden
surface identity terms and private material.
