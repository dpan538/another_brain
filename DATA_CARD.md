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
R25J adds tokenizer dry-run and toy decoder pipeline scaffolding. It may build
and evaluate a local dry-run tokenizer from approved training-corpus text, but
it does not run formal decoder training and does not commit generated artifacts.
R25K may run a toy-only overfit sanity check after explicit approval. R25L
expands deterministic project-authored corpus rows and plans a small decoder
pilot, but the pilot runner skips by default and no pilot weights are written.
R25M runs one bounded approved small pilot to ignored artifacts; R25N evaluates
it and consumes the approval markers. R25O designs the next R25P pilot and a
replayable ignored-checkpoint protocol, but it does not run training.
R25P runs exactly one approved second bounded pilot and writes a replayable
ignored checkpoint. R25Q analyzes that output only; it does not run training,
does not approve scaling, and does not change product training progress from
`0%`.
R25R designs a data-first R25S candidate only. It adds balanced sampling and
regularization plans, but R25S is not approved, no training runs, and product
training progress remains `0%`.
R25S runs exactly one approved data-first bounded pilot to ignored artifacts and
then consumes its approval. R25T analyzes R25S, compares it with R25P, checks
weak-bucket behavior, and adds an inert R25U architecture-ablation template; it
does not train and does not approve phase_4 scaled training.

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
- R25J tokenizer status: dry-run artifacts are generated only under ignored
  `artifacts/training_os/tokenizer_dryrun/` paths.
- R25J toy decoder status: overfit command is disabled by default and skips;
  no toy weights are committed.
- R25K toy overfit status: toy-only pipeline sanity may pass after explicit
  approval; toy artifacts remain ignored and are not release weights.
- R25L expanded corpus status: `r25l_train/dev/heldout` are deterministic
  project-authored behavioral rows, not eval data or factual knowledge cards.
- R25L small decoder pilot status: plan only; `run:small-decoder-pilot` skips
  by default and formal decoder training remains `0%`.
- R25M small decoder pilot status: one bounded approved run wrote ignored
  reports and a non-replayable checkpoint digest only.
- R25N evaluation status: R25M outputs analyzed, structural held-out eval
  passed, old approvals consumed, and active training approvals are `0`.
- R25O second-pilot design status: R25P approval template is `approved:false`;
  replayable checkpoint schema and replay-heldout scaffold are design-only.
- R25P second pilot status: one approved `r25p_more_sequences_128` pilot wrote
  ignored replayable checkpoint evidence and consumed its approval.
- R25Q analysis status: evaluates R25P behavior, replay determinism, held-out
  breakdown, and next-step recommendation without training.
- R25R design status: prepares an R25S data-first balanced sampling plan and
  inert approval template without running training.
- R25S data-first pilot status: one approved bounded pilot wrote ignored
  replayable checkpoint evidence and consumed its approval.
- R25T analysis status: evaluates R25S versus R25P, reports whether
  data-first balancing helped, and keeps R25U approval inert.
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

R25J adds tokenizer dry-run scripts that extract text only from approved
`training/llm_corpus/train.jsonl` fields and evaluate on dev/heldout corpus
text. It also adds a tiny decoder toy scaffold for future phase-2 mechanics;
the run command is disabled by default, writes no weights, and does not change
formal training progress from `0%`.

R25L tokenizer dry-run scripts may use only `training/llm_corpus/r25l_train.jsonl`
for expanded dry-run tokenizer training and only `r25l_dev.jsonl` /
`r25l_heldout.jsonl` for dry-run evaluation. R25L does not read root PDFs/DOCX,
`data/public_ingestion/`, private raw data, eval prompts, or external LLM
output.

R25M pilot dataset scripts may use only `training/llm_corpus/r25l_train.jsonl`
for bounded pilot training and `training/llm_corpus/r25l_dev.jsonl` for sanity
evaluation. They must not read evals, heldout as training, root PDFs/DOCX,
`data/public_ingestion/`, knowledge-source cards, private raw data, external
LLM output, or chain-of-thought data.

R25N does not train. It may read `training/llm_corpus/r25l_heldout.jsonl` for
held-out pilot evaluation only, and may compare against train/eval text for
contamination checks. It must not convert held-out text into training data and
must not read root PDFs/DOCX or `data/public_ingestion/`.

R25O also does not train. It may read existing ignored R25M/R25N reports to
plan a second bounded pilot and compare history. Future replayable checkpoints
remain ignored JSON artifacts only and are not product or release checkpoints.

R25P may train only the approved `r25p_more_sequences_128` second bounded pilot.
It may use `r25l_train.jsonl` for training, `r25l_dev.jsonl` for dev sanity,
and `r25l_heldout.jsonl` for replay evaluation only. R25P must not read evals,
root PDFs/DOCX, `data/public_ingestion/`, private raw data, factual knowledge
cards, external model output, or chain-of-thought data.

R25Q does not train. It may read ignored R25P reports, the replayable ignored
checkpoint, and `r25l_heldout.jsonl` for evaluation-only breakdowns. It must
not use held-out text for training and must not authorize R25R automatically.

R25S may train only the approved `r25s_data_first_balanced_192` data-first
bounded pilot. It may use R25L train rows for training, R25L dev rows for dev
sanity, and R25L held-out rows for replay evaluation only. It must not read
evals, root PDFs/DOCX, `data/public_ingestion/`, private raw data, factual
knowledge cards, external model output, or chain-of-thought data.

R25T does not train. It may read ignored R25S reports, the replayable ignored
checkpoint, and `r25l_heldout.jsonl` for evaluation-only breakdowns. It must
not use held-out text for training, must not rerun R25S/R25P/R25M/toy pilots,
and must not authorize R25U or phase_4 scaled training automatically.

R25U does not train. It defines phase 3 exit criteria, checks phase_4 scaled
training readiness as not approved, and plans possible architecture ablations or
data follow-ups for future review. R25V is represented only by an inert
`approved:false` template and cannot authorize training.

R25V may train only the approved `r25v_two_layer_same_width` architecture
ablation if a local backend can run a real two-layer pilot. It may use R25L
train rows for training, R25L dev rows for dev sanity, and R25L held-out rows
for replay evaluation only. It must not read evals, root PDFs/DOCX,
`data/public_ingestion/`, private raw data, factual knowledge cards, external
model output, or chain-of-thought data.

R25W does not train. It may read existing ignored R25V reports, the replayable
ignored R25V checkpoint, and `r25l_heldout.jsonl` for evaluation-only
breakdowns. It records that the R25V two-layer ablation did not improve
dev/held-out behavior versus R25S. R25W must not use held-out text for
training, must not rerun any consumed pilot, and must not authorize R25X or
phase_4 scaled training automatically.

The clone logic/ethics v0.1 casepacks are held-out evaluation assets. They are
real-event-derived and intended to test bounded dialog-surface judgment under
pressure: fact/inference separation, layered responsibility, uncertainty,
ethical sensitivity, and clone voice. They are not distillation data and must
not be used for training until verified evidence cards and a split policy exist.

The public Identity Pack is a scaffold and safe seed set, not a complete
identity dataset. Raw interview answers and unredacted cards must remain local
until each card is cleaned, assigned visibility, and checked for forbidden
surface identity terms and private material.
