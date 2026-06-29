# Data Card

## Purpose

The project uses local build scripts to generate a short-answer distillation
dataset and public browser artifacts for a local-first dialog runtime. R25
prepares a same-origin static browser LLM path. R25I clarifies that the final
target is a project-trained decoder LLM trained from scratch, then exported as
a static browser release artifact. R25A/R25B/R25C do not train a model,
download weights, commit real weights by default, or call external LLM APIs.
R25D adds fixture first-token smoke coverage only; it does not add a real
production model. R25E adds local artifact admission checks and remains blocked
unless a reviewed release artifact is supplied.
R25F resets the model-selection surface to a model-agnostic reviewed decoder
artifact placeholder and does not introduce a new named candidate.
R25G adds model-agnostic candidate decision records, conversion path review,
and a request pack. It still does not select or admit a model.

## Public Data

Public generated files may include:

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
- `static_llm/llm_manifest.schema.json`
- `static_llm/example_manifest.*.json`
- `static_llm/artifact_metadata.schema.json`
- `static_llm/inbox/artifact_metadata.example.json`

These files are generated for this project and are covered by the repository
license.

The reviewed knowledge source of truth lives in `knowledge_sources/registry.json`
and `knowledge_sources/cards/*.jsonl`. `build_sources/knowledge/knowledge_base.generated.js`
is generated from those reviewed chunks and remains outside the public runtime.
It is an intermediate build input for shard generation, not a deployable browser
artifact.

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
- unreviewed static LLM assets

## Current Dataset Snapshot

- Distillation rows: 76,365.
- Train rows: 74,580.
- Eval rows: 1,785.
- Cloud teacher used: false.
- Source files copied into public runtime: false.
- Private paths allowed in public runtime: false.
- Static LLM weights admitted in R25A: false.
- Static LLM weights admitted in R25B: false.
- Static LLM weights admitted in R25C: false.
- Static LLM weights admitted in R25D: false.
- Static LLM weights admitted in R25E: false unless a local reviewed artifact
  and explicit approval marker pass the gate.
- R25B LLM corpus rows: 480 generated behavioral scaffold rows.
- R25B corpus split policy: `train`/`dev`/`heldout`, separate from evals.
- R25C local artifact status: no reviewed local artifact admitted.
- R25D first-token status: fixture smoke only; real model smoke skipped without
  an admitted manifest.
- R25E artifact status: local inbox discovery and admission attempt; blocked
  when no reviewed decoder artifact exists.
- R25F candidate status: no named model selected; removed-candidate purge guard
  required.
- R25G decision status: awaiting candidate decision; no decision record admits
  weights.
- R25H capacity status: metadata-only capacity profiles and dry-run manifests;
  no artifact admission and no real performance evidence.
- R25I training status: from-scratch doctrine and plans only; formal training
  progress `0%`.
- Training enabled by default: false.

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

R24 recovery and shard gates are retained as guardrail, fallback, and regression
infrastructure. The R25 target is a browser-side static decoder LLM that drafts
from same-origin assets and is wrapped by verifier/finalizer/fallback gates.
SLM/personal-200M artifacts are legacy comparison surfaces, not the final
product target.

R25B adds `training/llm_corpus/` as future LLM training-content scaffolding.
It is project-authored behavioral data, not model output, not private data, not
chain-of-thought data, and not factual knowledge-card expansion. It must pass
corpus validation, eval-contamination checks, and coverage reporting before any
future training use.

R25I adds `training/from_scratch/` as the doctrine and planning surface for the
future model. LoRA, fine-tuning, adapters, and pretrained imports are not the
final product strategy; external artifacts are comparison or compatibility only.

The clone logic/ethics v0.1 casepacks are held-out evaluation assets. They are
real-event-derived and intended to test bounded dialog-surface judgment under
pressure: fact/inference separation, layered responsibility, uncertainty,
ethical sensitivity, and clone voice. They are not distillation data and must
not be used for training until verified evidence cards and a split policy exist.

The public Identity Pack is a scaffold and safe seed set, not a complete
identity dataset. Raw interview answers and unredacted cards must remain local
until each card is cleaned, assigned visibility, and checked for forbidden
surface identity terms and private material.
