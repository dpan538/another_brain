# Another Brain

Another Brain is the source repository for Answer Machine, a local-first browser-side answer web app at `efishother.com`. R25 changes the target architecture to an LLM-first static browser runtime: a future project-trained decoder LLM drafts in the browser, while the R24 recovery gates, shard runtime, verifier, finalizer, and fallback firewall wrap that draft.

The public UI is intentionally small: one input box, no account, no cloud inference, and no remote LLM call. The browser path is designed to stay light enough for mobile devices.

Launch domain: `efishother.com`.

Public product name: `Answer Machine`.

GitHub description: `Answer Machine: local-first browser-side answers with deterministic rules, static knowledge cards, and no cloud inference.`

## Runtime Shape

The active product target is a same-origin static decoder LLM running in the browser. R25I clarifies the final model strategy: train a decoder LLM from scratch for this project, then export a static browser release artifact that fits the Vercel static envelope. Vercel is used only for static hosting: no Vercel Function inference, no Edge Function inference, no external LLM API, and no external storage product for model loading. Browser cache/storage is allowed because it is user-local.

This is not an omniscient assistant or a generic chatbot. The private design model can talk about subject, Crocodile, body, symbol, and copy, but the front-stage dialog does not explain itself that way. Its public identity is deliberately smaller: it is a dialog box; it was once called Crocodile; the rest stays before or after the conversation.

```text
user input
  -> shard-first static knowledge lookup
  -> static browser LLM draft
  -> R24 verifier / finalizer / fallback firewall
  -> answer or controlled fallback
```

The old tiny router and personal-200M / mini-web SLM planning surface is now legacy fallback and test harness. It is not the final product target. It remains useful for R24 regression gates, sanity checks, and bounded fallback behavior while R25 prepares static LLM admission.

R25A/R25B do not ship model weights. R25C adds local artifact intake and dry-run admission gates only. R25D adds the browser backend/worker scaffold and fixture first-token smoke harness. R25E attempts local artifact admission only from approved inbox paths and remains blocked when no reviewed artifact is present. A real model can be committed only after explicit candidate-scoped user approval and a reviewed local artifact passes manifest, budget, no-backend, license/provenance, backend-format, first-token, and R24/R25 gates.

R25F resets model selection to a model-agnostic state. No named decoder model is selected, no replacement candidate is introduced, and the next candidate must arrive through a later reviewed decision or a user-supplied local decoder artifact.

R25G adds the reviewed decision framework for that future candidate: candidate decision records, conversion path review, and a request pack. These records do not admit weights.

R25H adds the static capacity envelope and candidate dry-run simulator. It
generates metadata-only non-admitted dry-run manifests, estimates browser
memory/storage risk, and simulates deploy payload size without selecting a
named model, creating large files, admitting assets, downloading weights, or
training.

R25I adds the from-scratch training doctrine, release-decision schema,
architecture envelope, tokenizer plan, corpus mix plan, and phase plan. Formal
training progress remains `0%`: no training command runs, no weights are
created, and LoRA/fine-tuning/adapters are rejected as the final strategy.
Existing pretrained artifacts can only be baseline or compatibility inputs, not
the main product path.

R25J adds the phase-1 tokenizer dry-run pipeline and phase-2 toy decoder
pipeline scaffold. The tokenizer dry-run writes only ignored local artifacts
and evaluates dev/heldout text for leakage and segmentation sanity. The tiny
decoder overfit command is disabled by default and reports a safe skip; no
formal decoder training starts and no weights are written or committed.

R25K runs a reviewer-approved toy-only overfit sanity check. R25L expands the
reviewed corpus into `r25l_train/dev/heldout` files, runs an expanded tokenizer
dry-run, and plans a small decoder pilot. The pilot runner skips by default, no
small decoder training starts, no product model exists, and formal training
progress remains `0%`.

R25M runs one bounded small decoder pilot after explicit approval. R25N
evaluates that output, consumes the R25K/R25M approvals, and keeps active
training approvals at zero. R25O designs a future R25P second pilot and
replayable ignored checkpoint protocol only; it does not run training, does not
approve R25P, and does not change product training progress from `0%`.
R25P runs exactly one approved `r25p_more_sequences_128` pilot and writes a
replayable ignored checkpoint. R25Q analyzes that result, checks replay
determinism and held-out breakdowns, adds an inert R25R approval template, and
still keeps product and formal training progress at `0%`.
R25R designs a data-first R25S candidate with balanced sampling and lower
learning rate, but it does not run training, does not approve R25S, and does
not approve phase 4 scaled training. Product training progress remains `0%`.
R25S runs exactly one approved data-first pilot and consumes its approval.
R25T analyzes R25S against R25P, checks whether balancing improved held-out
behavior, adds an inert R25U architecture-ablation approval template, and still
does not run training or approve phase 4 scaled training. Product training
progress remains `0%`.
R25U defines phase-3 exit criteria, reports phase_4 readiness as not approved,
and designs architecture ablation options for a future R25V review. It does not
train, does not approve R25V, and does not approve phase_4 scaled training.
Product training progress remains `0%`.

The fallback policy path is deliberately small. It chooses a response strategy without exposing chain-of-thought: missing premise, ask for the premise; unclear direction, counterquestion; encyclopedia request, send the user to search; uncertain memory, answer with bounded uncertainty. The browser runtime now runs a structured fallback check after direct answers and legacy tiny-router answers, so route misses are still handled by deterministic route/evidence/verifier logic until a real static LLM is admitted.

The voice is intentionally unified. Another Brain does not split public persona from private tone; personal calibration is part of the subject, while privacy rules protect raw files, sensitive facts, and local artifacts.

## Privacy Rules

- No cloud inference APIs.
- No Vercel Function or Edge Function LLM inference.
- No external storage product for model loading.
- Do not commit local memory artifacts, drive inventories, model weights, or LoRA checkpoints.
- Do not copy original source materials from a local drive into the repository.
- Do not read paths that look like identity, banking, visa, passport, address proof, or account-number material.
- Sensitive skipped items are represented only by hashed refs and counts in local artifacts.
- Non-sensitive text can be summarized locally, with names, addresses, emails, phones, and ID-like numbers redacted before storage.
- Privacy boundaries protect source material and sensitive facts; they do not weaken the unified dialog subject.

## Quick Start

Serve the static web app:

```bash
python3 -m http.server 5173 --directory web
```

Open `http://localhost:5173`.

Run the release preflight:

```bash
npm run check:release
```

Probe the dialog runtime without the frontend:

```bash
npm run probe:dialog -- --prompt "门禁为什么不是为了好看？" --prompt "我们是什么关系？" --text
```

For batch testing, pass JSONL lines as strings or objects with `prompt`, `text`, `query`, or `user`:

```bash
npm run probe:dialog -- --jsonl evals/probe/prompts.jsonl --out artifacts/training_os/dialog_probe_report.json
```

The checked-in public runtime ships with hand-written persona calibration, but without raw personal memory cards. Shared public generated files in `web/` are tracked; private local payloads such as `artifacts/` and `web/brain_pack.js` are ignored by git.

## Local Build Workflow

Build and validate a private local memory pack:

```bash
python3 scripts/scan_drive.py --source "/path/to/local/source" --out-dir artifacts
python3 scripts/build_brain_pack.py --source "/path/to/local/source" --inventory artifacts/t7_inventory.jsonl --out-dir artifacts --web-dir web
python3 scripts/validate_brain_pack.py --brain-pack artifacts/brain_pack.json
```

Build shared browser knowledge and legacy fallback artifacts:

```bash
npm run build:knowledge
python3 scripts/build_distillation_dataset.py
python3 scripts/train_tiny_router.py
```

`npm run build:knowledge` derives the generated knowledge build source from
`knowledge_sources/registry.json` and `knowledge_sources/cards/*.jsonl`, then
regenerates `web/knowledge_shards/manifest.json`, `routing.json`, and shard
files. The generated build source stays outside deployable `web/`.

Run the local gates:

```bash
python3 scripts/validate_distillation.py
python3 scripts/eval_tiny_router.py
python3 scripts/bench_knowledge_runtime.py
python3 scripts/validate_training_os.py
python3 scripts/eval_dialog_persona.py
node scripts/run_model_gate_node.mjs --out /tmp/another_brain_model_gate.json
```

Run the R25 static LLM scaffold gate:

```bash
npm run check:r25-llm-first-static
npm run check:r25b-static-decoder-training
npm run check:r25c-static-artifact-intake
npm run check:r25d-browser-inference-binding
npm run check:r25e-artifact-admission
npm run check:r25f-candidate-purge
npm run check:r25g-candidate-decision
npm run check:r25h-capacity-envelope
npm run check:r25i-from-scratch-roadmap
npm run check:r25j-tokenizer-toy-pipeline
npm run check:r25k-toy-overfit-sanity
npm run check:r25l-corpus-pilot-plan
npm run check:r25n-small-pilot-evaluation
npm run check:r25o-second-pilot-design
npm run check:r25p-second-small-pilot
npm run check:r25q-pilot-analysis
npm run check:r25r-data-first-pilot-design
npm run check:r25s-data-first-pilot-history
npm run check:r25t-r25s-analysis
```

Build and validate the mixed context stress suite:

```bash
python3 scripts/build_context_stress_cases.py
python3 scripts/validate_context_stress_cases.py
```

Build and run synthetic casepack capability evals:

```bash
python3 scripts/build_casepack_evals.py
node scripts/eval_casepacks_node.mjs --min-score 0.88 --out /tmp/another_brain_casepack_eval.json
```

Validate the held-out clone logic and ethics stress eval:

```bash
python3 scripts/validate_clone_logic_ethics.py
```

Validate the launch-governance contract:

```bash
python3 scripts/validate_launch_policy.py
```

Validate the public Identity Pack skeleton:

```bash
python3 scripts/validate_identity_pack.py
```

Validate first-visit help and onboarding behavior:

```bash
python3 scripts/eval_help_onboarding.py
```

Validate frozen train/dev/blind dataset splits:

```bash
python3 scripts/validate_dataset_splits.py
```

Validate loaded-page answer latency:

```bash
node scripts/eval_frontend_latency.mjs --max-answer-ms 1500
```

Validate voice and output verifier constraints:

```bash
python3 scripts/eval_voice_verifier.py
```

Validate gate effectiveness with known failures, invariants, fuzz, and synthetic mutation probes:

```bash
node scripts/eval_gate_effectiveness.mjs
```

Validate held-out blind logic/ethics casepacks:

```bash
node scripts/eval_blind_casepacks_node.mjs --median-min 11 --p25-min 8 --critical-failures 0
```

Validate automated preview/mobile smoke:

```bash
node scripts/eval_r6_preview_mobile.mjs --prompts evals/r6_mobile/prompts.jsonl
```

Validate production-candidate freeze with rollback target:

```bash
python3 scripts/eval_r7_production_candidate.py --rollback auto
```

Validate local debug-report workflow:

```bash
node scripts/eval_r8_debug_report.mjs
```

Run the launch-readiness detector:

```bash
npm run check:launch-readiness
```

## Current Gate Snapshot

- Distillation dataset: 76365 rows, 74580 train, 1785 eval.
- Tiny router web artifact: 7581139 bytes, observed only. In R25 it is legacy fallback/test harness, not the final intelligence layer.
- Tiny router v2 label mode: action labels.
- Tiny router feature weights: 32000.
- Tiny router answer index: 789.
- Tiny router action accuracy: 0.9414 overall, identity 1.0000, privacy 1.0000, help 1.0000.
- Tiny router family-holdout accuracy: 0.9467 across 6833 held-out examples from unseen source/tag/id families.
- Relationship repetition gate: 16/16 turns passed.
- Knowledge runtime: 55151 generated cards available through shard-first lazy loading; direct lookup stays synchronous after query warmup.
- Knowledge source of truth: `knowledge_sources/registry.json` plus 37 reviewed JSONL chunks extracted from the R24F build source.
- Knowledge generated build source: 7645750 bytes at `build_sources/knowledge/knowledge_base.generated.js`, outside deployable `web/`.
- Knowledge shards: 43 static JSON shards, max shard size 179996 bytes, plus a 1400960 byte routing index generated from labels and aliases.
- Dialog persona eval: 742 cases, including 16 surface-identity cases, 0 failures.
- Help/onboarding eval: 23/23 passed, no fallback answers, no assistant-tone hits.
- R2 split manifest: 7 datasets, 140 public/style metadata cases, family-held-out 70/15/15 train/dev/blind split, blind cases not used for training.
- Frontend loaded-page answer latency gate: every sampled prompt must answer within 1500ms after submit.
- Voice verifier: forbidden identity output 0, privacy leaks 0, assistant-tone rate 0.0000, average answer length 19.36 chars, preference win rate 1.0000.
- Gate effectiveness audit: 50/50 known-failure regressions passed, trace completeness 59/59, invariant violations 0, fuzz pass 8/8, mutation score 1.0000 with 10/10 mutants killed.
- Context-window gate: UI shows 4 recent turns; hidden reasoning keeps 12 turns.
- Context stress suite: 100 groups, 1600 questions, 1500 context assertions, 485 required context-delta checks.
- Context stress distribution: 20 single-topic groups, 39 adjacent-bridge groups, 21 soft multi-insert groups, 20 hard-mixed groups.
- Context stress gate: coverage 1.0000, required context-delta ratio 1.0000, 0 failures.
- Casepack capability eval: 10 casepacks, 160 questions, average score 1.0000, 0 failures.
- Clone logic/ethics held-out eval: 30 real-event-derived casepacks, 480 turns, 16 judgment actions, structure gate passed.
- Integrated blind casepack eval: 30 casepacks, 480 turns, median 14.4065/16, p25 14.375/16, critical failures 0, distractor pass 1.0000, self-audit pass 1.0000.
- Model gate: 807/807 passed, 37/37 Web SLM cases passed.
- R6 automated preview/mobile smoke: local static preview, 4 viewport contracts, 100+ runtime turns, console errors 0, all answers within 1500ms.
- R7 production-candidate freeze: release preflight and knowledge-shard validation pass with explicit rollback target; no production promotion.
- R8 debug-report workflow: local JSON export validates schema and sensitive-content scan; transcript is opt-in.
- Tiny router memory answers in the public exact index: 0.

## Repository Contents

- `web/`: static browser app and public runtime modules.
- `web/tiny_router.js`: browser-side Web SLM wrapper.
- `web/tiny_router_model.generated.js`: compact generated tiny-router artifact.
- `web/static_llm_runtime.js`: browser-side static LLM loader interface, disabled until model admission.
- `web/llm_answer_contract.js`: R25 LLM draft contract wrapped by R24 verifier/fallback boundaries.
- `static_llm/`: static LLM manifest schema and example manifests; no model weights are admitted in R25A.
- `web/knowledge_runtime.js`: shard-first browser knowledge loader and in-memory shard cache.
- `knowledge_sources/`: reviewed source-of-truth registry and JSONL chunks for generated knowledge rows.
- `build_sources/knowledge/knowledge_base.generated.js`: monolithic generated common-knowledge build source, kept outside deployable `web/`.
- `web/knowledge_shards/`: static shard JSON files, manifest, and routing index for CDN-friendly lazy loading.
- `web/context_stress_cases.json`: 100x16 mixed context stress cases for training calibration.
- `web/structured_decision.js`: structured route, evidence sufficiency, and answer verifier helper.
- `evals/casepacks/`: synthetic casepack-16 capability evals.
- `evals/clone_logic_ethics/`: held-out real-event-derived clone judgment stress eval; not training data.
- `docs/clone_training_strategy.md`: training plan for the bounded subject-copy direction.
- `docs/release_governance.md`: production launch gates, milestone rules, freeze policy, and final review thresholds.
- `evals/release_policy/release_status.json`: current release-governance status; production review is locked until R0-R8 pass.
- `identity_pack/`: public identity contract, safe seed cards, schemas, and interview question bank for building redacted identity/background datasets.
- `scripts/eval_launch_readiness.py`: runs the current launch gates and writes a milestone/blocker report under `artifacts/release/`.
- `scripts/`: local build, validation, training, and gate scripts.
- `models/manifest.json`: tiny-router runtime metadata.
- `artifacts/`: ignored local runtime outputs.
- `MODEL_CARD.md`: model scope, training data, limitations, and current artifact snapshot.
- `DATA_CARD.md`: public and private data boundaries.
- `PRIVACY.md`: local-first privacy policy.
- `DEPLOYMENT.md`: Vercel static deployment notes.
- `LICENSE` and `NOTICE`: source-available, all-rights-reserved license posture.

## Deployment

The launch target is static Vercel hosting for `efishother.com`. Vercel should not run model inference, generate memory packs, use Functions or Edge Functions for LLM inference, or depend on external storage for model loading. Future R25 model assets must be same-origin static files admitted by manifest and budget checks. The checked-in `vercel.json` uses `web/` as the output directory and runs only the static build preflight.

Public crawl and AI-readable resources are checked in under `web/`:

- `web/sitemap.xml`: Google Search Console sitemap URL, served as `https://www.efishother.com/sitemap.xml`.
- `web/robots.txt`: crawler policy and sitemap pointer.
- `web/llms.txt`: concise AI-readable project description and boundaries.
- `web/about.txt`: plain-text project summary.
- `web/site.webmanifest`: install/app metadata for the public name.
- `web/index.html`: canonical title, description, Open Graph/Twitter metadata, hidden H1 summary, and JSON-LD structured data.

Before deploying:

```bash
npm run check
```

Validate crawl metadata alone:

```bash
npm run check:seo
```

`npm run check:release` is intentionally lighter and suitable as a Vercel build command. `npm run check` is the fuller local gate.

Passing `npm run check` is necessary but not sufficient for production. Final
production review is locked by `docs/release_governance.md`: R0-R8 must pass,
critical failures must remain 0, the production runtime budget must be met, and
you must explicitly approve promotion before `final_release_allowed` can become
`true`.

## License

Copyright (c) 2026 Dai Pan / dpan538. All rights reserved.

This repository is source-available only. You may view and fork the repository under GitHub's Terms of Service, but no permission is granted to use, copy, modify, distribute, sublicense, train on, deploy, or create derivative works from the source code, generated artifacts, model artifacts, datasets, personal calibration data, or local memory artifacts unless a separate written license grants those permissions.

Private local artifacts, including `artifacts/**`, `web/brain_pack.js`, local memory packs, drive inventories, model checkpoints, LoRA adapters, local model weights, and source materials, are not distributed and are not licensed.

## Training Direction

R25 changes the product target to a same-origin static decoder LLM running in
the browser. The tiny router, personal-200M, mini-web-LLM, and micro-solver
surfaces are legacy fallback, comparison, or guardrail infrastructure only.

R25B adds a reviewed LLM training-content scaffold under
`training/llm_corpus/`. It is separated from evals, validated for
train/dev/heldout contamination, and intended for future fine-tuning or
distillation planning. R25B does not run training, add real weights, call
external model APIs, or add factual knowledge-card expansion.

The future admission path is:

1. Choose a decoder-only candidate for the largest feasible static Vercel
   profile, likely `pro_static_llm_full`.
2. Locally convert and review the artifact in R25C or later.
3. Add real sha256 manifests and same-origin static assets only after license,
   provenance, budget, browser-loader, and R24/R25 gates pass.
4. Keep R24 verifier, finalizer, fallback firewall, shard runtime, and recovery
   gates around any LLM draft.

LoRA experiments and SLM plans are historical research artifacts and are not
required for the R25 browser LLM launch path.

R25L expands the reviewed behavioral corpus and plans a small decoder pilot.
R25M may run one reviewer-approved bounded small decoder pilot to ignored
artifacts only. It is not long-term training, not product-scale training, not a
release checkpoint, and not a static browser deployment. Product training
progress remains `0%`; the pilot only checks local dataset, tokenizer, numeric
training, and metric plumbing.

R25N evaluates the R25M outputs and consumes the R25K/R25M one-shot approval
markers. Routine gates now validate history and held-out structural sanity
without rerunning toy or small-pilot training. Any later R25O/R25M2 run needs a
fresh reviewer approval marker.

R25O designs the second bounded pilot and replayable checkpoint protocol.
R25P may run exactly one fresh-approved `r25p_more_sequences_128` pilot to
ignored artifacts only. Its replayable JSON checkpoint enables held-out replay
loss, but it is not a product model, release checkpoint, browser static asset,
or committed weight. Product and formal training progress remain `0%`.

R25Q analyzes R25P without running training. It reports loss gaps,
deterministic replay status, held-out breakdowns, and a reviewer-facing next
step recommendation. R25R is represented only by an inert approval template;
any next pilot requires fresh one-shot approval, and phase 4 scaled training is
not approved.

R25S may run exactly one fresh-approved data-first bounded pilot,
`r25s_data_first_balanced_192`, to ignored artifacts only. It is not product
training, long-term training, phase_4 scaled training, release admission, or a
browser static artifact. Its replayable checkpoint remains ignored and
untracked, and the approval is consumed after the run.
