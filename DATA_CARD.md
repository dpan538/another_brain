# Data Card

## Purpose

The project uses local build scripts to generate a short-answer distillation
dataset and public browser artifacts for a local-first dialog runtime. R25
prepares a same-origin static browser LLM path. R25I/R25AB clarify that the
final target is a Chinese-first, project-trained decoder LLM trained for this
project, not a project reset, then exported as a static browser release
artifact. R25A/R25B/R25C do not train a model,
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
R25V runs one approved two-layer architecture ablation to ignored artifacts.
R25W analyzes that ablation and finds data-first R25S remains stronger on
dev/held-out behavior. R25X reviews phase 3, audits data quality, and creates
an inert R25Y data-regularization design; it does not train, does not approve
R25Y, and does not approve phase_4 scaled training.
R25AB aligns the next cycle around a Chinese-first personal model goal. It
adds doctrine and inert R25AC design files only: no training, no phase_4
approval, no product progress, and no committed weights.
R25AC runs exactly one fresh-approved Chinese-first personal micro-cycle from
reviewed R25L rows only. It writes ignored local pilot artifacts, consumes the
approval marker, keeps product/formal training progress at `0%`, does not
approve phase_4 scaled training, and commits no weights or artifacts.
R25AD analyzes that micro-cycle without training or corpus mutation. R25AC hit
the `zh >= 70%` and `en <= 10%` sampling target but did not beat R25S held-out
loss, so R25AD recommends R25AE as a repository-scoped personal-data and corpus
inventory before any expansion or training. No external LLM generation or
private sources are allowed, and no weights or artifacts are committed.

R25AE inventories current repo-local personal-data surfaces only. It does not
train, does not expand corpus, does not scan outside the repo root, does not
ingest root PDFs/DOCX, does not parse `data/public_ingestion/` content, and
does not commit generated inventory artifacts. Its tracked summaries are
aggregate-only. Future personal-writing intake and derived corpus expansion
need fresh approval and would still not be training; future training needs
separate fresh approval.

R25AF designs a local-only personal writing intake path. User writing and
poetry may be useful style/source material, but raw writing is not direct
dialogue data and is private by default. Poetry and prose must be transformed
into reviewed dialogue rows, preference pairs, repair pairs, style cards, or
project-continuation rows before any future corpus use. R25AF does not parse
raw personal sources, does not generate corpus rows, does not train, and does
not commit private writing. R25AG may later generate a derived corpus only with
fresh approval; future training after that needs another approval.

R25AG repository text discovery catalogs existing text surfaces inside the repo
before asking for more uploads. It does not train, does not generate corpus
rows, does not modify `training/llm_corpus`, does not parse root PDFs/DOCX,
does not bulk-parse `data/public_ingestion`, and does not commit artifacts or
private raw text. The output is an aggregate candidate source catalog for later
review; phase_4 remains blocked.

R25AH selects tracked repo-local sources from that catalog and generates
unreviewed Chinese-first repo-derived candidate rows under ignored artifacts
only. It does not train, promote rows, modify `training/llm_corpus`, read
`private_sources`, parse root PDFs/DOCX, parse `data/public_ingestion`, call
external APIs, commit artifacts, or commit weights. R25AI is required before
any reviewed R25AH candidates can be promoted, and later training needs another
fresh approval.

R25AJ repairs the uniqueness failure from the blocked R25AI attempt and adds a
candidate review rubric. It writes improved candidates under ignored artifacts
only and does not train, promote rows, run tokenizer dry-run, or modify
`training/llm_corpus`.

R25AK promotes a bounded reviewed subset of unique repo-derived candidates into
tracked `r25ak_repo_derived_*` corpus split files. It does not train, does not
run tokenizer dry-run, commits no ignored artifacts, and commits no weights.

R25AL reviews the post-R25AK expanded corpus and runs exactly one approved
tokenizer dry-run readiness pass. It reports low tokenizer risk but still
recommends more Chinese-personal rows. It does not run decoder training,
small-pilot training, phase_4 scaled training, or commit tokenizer artifacts.

R25AM performs a second Chinese-personal repo-derived corpus expansion and
promotion from tracked safe repo sources. It adds reviewed
`r25am_repo_derived_*` corpus split files only; it does not train, does not run
tokenizer dry-run, does not read private sources, does not use evals as
sources, does not commit artifacts, and does not commit weights. Future
tokenizer review needs fresh R25AN approval, and future decoder training needs
another separate approval.

R25AN reviews the R25AM-expanded tracked corpus, evaluates Chinese-first
sampler feasibility, and may run one tokenizer dry-run readiness pass. It does
not run decoder training, small-pilot training, phase_4 scaled training,
long-term training, or product-scale training. Tokenizer artifacts remain
ignored and uncommitted. R25AO is an inert future bounded micro-cycle template
until fresh explicit approval exists.

R25AO later runs exactly one approved bounded expanded Chinese-personal
micro-cycle to ignored artifacts. R25AP analyzes those results only. R25AO met
the zh-first sampler target and reduced train/dev loss, but heldout loss
regressed against R25S and mixed/en buckets were weaker than zh. R25AP does not
train, rerun pilots, run tokenizer dry-run, expand corpus, approve phase_4, or
commit artifacts/weights. Product and formal decoder training progress remain
`0%`.

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
- R25U planning status: defines phase 3 exit criteria and keeps phase_4 scaled
  training unapproved.
- R25V architecture ablation status: one approved two-layer pilot wrote ignored
  replayable checkpoint evidence and consumed its approval.
- R25W analysis status: reports that R25V did not improve dev/held-out behavior
  versus R25S and keeps phase_4 blocked.
- R25X review status: audits data quality, summarizes R25S best rows, and adds
  an inert R25Y data-regularization design without training.
- R25AB Chinese-first status: doctrine and checks only; English is secondary,
  phase_4 remains unapproved, and no weights are committed.
- R25AC Chinese-first micro-cycle status: one bounded approved run may write
  ignored artifacts only; approval is consumed after the attempt, active
  training approvals return to `0`, and no artifacts or weights are committed.
- R25AE personal inventory status: repo-scoped aggregate inventory only; root
  PDFs/DOCX and `data/public_ingestion/` are metadata-only.
- R25AF writing intake status: design only; no raw writing is parsed, no corpus
  rows are generated, and no training runs.
- R25AG repo text discovery status: aggregate discovery and ranking only; no
  corpus rows are generated, `training/llm_corpus/` is unchanged, and no
  artifacts are committed.
- R25AH repo-derived candidate status: 440 ignored unreviewed candidate rows
  generated from 52 selected tracked repo sources; `training/llm_corpus/` is
  unchanged, rows remain `training_allowed:false`, and no artifacts or weights
  are committed.
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
future model. R25AB clarifies that project-trained and self-trained mean
continuing this project toward a Chinese-first personal decoder, not resetting
R24/R25 work. LoRA, fine-tuning, adapters, and pretrained imports are not the
final product strategy; external artifacts are comparison or compatibility only.

R25AA adds a phase 3 pause packet and phase_4 readiness review only. It adds no
new corpus rows, factual knowledge cards, chain-of-thought data, or training
run, and phase_4 scaled training remains unapproved.

R25AB adds Chinese-first direction docs, a personal-color boundary, a healthy
training-cycle spec, an inert R25AC approval template, and a corpus language
audit. Personal color may come only from reviewed public/project-authored style,
user-approved preferences, project decisions, observable constraints, and repo
Chinese tone examples. It must not come from raw private memory, root PDFs/DOCX,
`data/public_ingestion/`, hidden prompts, secrets, exact eval prompt copies, or
unreviewed personal documents.

R25AC may use only the approved R25L train/dev/held-out splits for its bounded
Chinese-first personal micro-cycle. Held-out rows are evaluation-only, not
training data. The micro-cycle must not read root PDFs/DOCX,
`data/public_ingestion/`, private raw data, eval prompts, factual knowledge
cards as an intelligence substitute, external model output, or chain-of-thought
data.

R25AF may inventory only the ignored local personal-writing inbox path and only
as metadata. Raw poems, essays, fragments, notes, preferred answers, and
repaired answers are source material, not direct training rows. They must be
reviewed and transformed into derived Chinese-first dialogue rows or preference
artifacts before any future corpus expansion. R25AF does not generate rows,
does not train, and does not commit private raw writing.

R25AG searches existing repository text before requesting new uploads. It can
read tracked project docs and structured corpus scaffolds for aggregate
classification, but root PDFs/DOCX and `data/public_ingestion/` stay
metadata-only. R25AG does not generate rows, does not train, does not promote
derived candidates, and does not commit artifacts or private raw text.

R25AE may inventory repository-local surfaces only. Root PDFs/DOCX and
`data/public_ingestion/` are metadata-only, not parsed, not ingested, and not
training corpus. Current answer and corpus counts are aggregate-only in tracked
docs. Future corpus expansion requires fresh approval, future training requires
separate fresh approval, phase_4 remains blocked, and no weights or artifacts
are committed.

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

R25X does not train. It may read R25L train/dev/held-out corpus files for data
quality auditing, read existing ignored R25S/R25V/R25W reports for review, and
write ignored R25X audit reports only. It designs R25Y as an inert
data-regularization pilot based on R25S, not architecture scaling. R25X must
not use held-out text for training, must not rerun any consumed pilot, and must
not authorize R25Y or phase_4 scaled training automatically.

R25Y may train only the approved `r25y_data_regularized_192`
data-regularization pilot. It uses R25L train rows for training, R25L dev rows
for dev sanity, and R25L held-out rows for replay evaluation only. It must not
read evals, root PDFs/DOCX, `data/public_ingestion/`, private raw data,
factual knowledge cards, external model output, or chain-of-thought data.
After the one-shot attempt, the approval is consumed and future training
requires a new reviewer approval marker. Phase_4 scaled training remains
blocked.

R25Z does not train. It may read existing ignored R25Y reports, the replayable
ignored R25Y checkpoint, and `r25l_heldout.jsonl` for evaluation-only
breakdowns. It must not use held-out text for training, must not rerun any
consumed pilot, and must not authorize R25AA or phase_4 scaled training
automatically.

The clone logic/ethics v0.1 casepacks are held-out evaluation assets. They are
real-event-derived and intended to test bounded dialog-surface judgment under
pressure: fact/inference separation, layered responsibility, uncertainty,
ethical sensitivity, and clone voice. They are not distillation data and must
not be used for training until verified evidence cards and a split policy exist.

The public Identity Pack is a scaffold and safe seed set, not a complete
identity dataset. Raw interview answers and unredacted cards must remain local
until each card is cleaned, assigned visibility, and checked for forbidden
surface identity terms and private material.

R25AJ candidate-repair data is ignored review material only. It may read the
safe R25AH selected tracked-source catalog and old ignored candidate artifact
for diagnostics, then regenerate repo-derived candidates under ignored
artifacts. It must not train, promote rows, change `training/llm_corpus`, read
`private_sources`, parse root PDF/DOC/DOCX files, parse `data/public_ingestion`,
use evals as candidate sources, or commit generated rows. R25AK is required for
any future bounded promotion, and later training requires a separate approval.

R25AK promoted reviewed unique repo-derived rows into tracked split corpus
files under `training/llm_corpus`. These rows are public/tracked only because
their source material is already safe repo-tracked project text. R25AK does not
train, does not run tokenizer dry-run, does not read `private_sources`, does
not parse root PDF/DOC/DOCX or `data/public_ingestion`, does not use evals as
source material, and does not commit ignored artifacts or weights.

R25AL reviews the expanded tracked corpus and may run one tokenizer dry-run
readiness pass only. It does not run decoder training, small-pilot training,
phase_4 scaled training, long-term training, or product-scale training. The
tokenizer dry-run artifacts remain ignored and uncommitted. Later R25AM/R25AN
corpus and tokenizer review still does not approve training. Future R25AO
micro-cycle training requires fresh explicit approval, and phase_4 remains
blocked.

R25AO later ran exactly one fresh-approved bounded expanded Chinese-personal
small decoder pilot from tracked `training/llm_corpus/` split files only. It
did not read `private_sources`, root PDF/DOC/DOCX content, or
`data/public_ingestion/`; it did not use eval prompts as training rows. The
R25AO run met the zh-first sampled split target, wrote ignored artifacts only,
consumed its approval, and did not approve product/formal training, tokenizer
dry-run, release admission, or phase_4 scaled training.

R25AQ is analysis and sampler/curriculum repair design only. It does not train,
rerun R25AO, run tokenizer dry-run, expand corpus, generate train/dev/heldout
datasets, or modify `training/llm_corpus`. It records that R25AO sampler
success was not quality success: heldout regressed, mixed/en buckets weakened
relative to zh, and high-loss task families need review. The future R25AR
template is `approved:false`; no phase_4, product/formal training, release
checkpoint, backend/storage path, external API/download, chain-of-thought, raw
private data, committed artifact, or committed weight is introduced.
## R25AR Data Note

R25AR sampled only tracked `training/llm_corpus` split files and did not modify the corpus. The train mix was zh 250, mixed 96, en 38. Root PDFs/DOCX, `private_sources`, `data/public_ingestion`, evals, and knowledge-source cards were not used as training sources.
