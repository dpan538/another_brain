# Another Brain

Another Brain is a local-first dialog-copy experiment with a tiny browser-side language layer. It turns allowed local materials into redacted memory structures, then answers through deterministic dialog rules, static knowledge lookup, and a compact tiny router that acts as a route-and-answer Web SLM.

The public UI is intentionally small: one input box, no account, no cloud inference, and no remote LLM call. The browser path is designed to stay light enough for mobile devices.

Launch domain: `efishother.com`.

GitHub description: `Local-first browser-side dialog copy: deterministic rules, static knowledge cards, and a route-and-answer Web SLM with no cloud inference.`

## Runtime Shape

The router owns control flow. A larger local LLM is not part of the first public runtime. Vercel is used only for static hosting.

This is not an omniscient assistant or a generic chatbot. The private design model can talk about subject, Crocodile, body, symbol, and copy, but the front-stage dialog does not explain itself that way. Its public identity is deliberately smaller: it is a dialog box; it was once called Crocodile; the rest stays before or after the conversation.

```text
user input
  -> deterministic dialog rules
  -> generated static knowledge cards
  -> tiny router Web SLM
  -> structured route/evidence/verifier fallback
  -> short controlled fallback answer
```

The tiny router is not a general generative model. It is a character n-gram classifier plus conservative answer index: a compact route-and-answer layer trained from the public dialog teacher, model-gate cases, correction pairs, common knowledge cards, help/onboarding cases, surface-identity cases, reasoning/counterquestion calibration, context-window calibration, relationship-repetition calibration, and persona alignment. In the current public gate, 768/805 cases are direct rule or knowledge answers, and 37/805 use the tiny router Web SLM.

WebLLM is intentionally out of the first public runtime. It does not accelerate the tiny router classifier, and previous local checks showed that the small generative fallback was too likely to drift or hallucinate in open dialog. The reliable path is to train the tiny router directly and keep unknown questions, privacy-sensitive questions, and route misses controlled by deterministic rules.

The reasoning path is deliberately small. It trains the SLM to choose a response strategy, not to expose long chain-of-thought: missing premise, ask for the premise; unclear direction, counterquestion; encyclopedia request, send the user to search; uncertain memory, answer with bounded uncertainty. The browser runtime now runs a structured fallback check after direct answers and tiny-router answers, so route misses are still handled by deterministic route/evidence/verifier logic rather than a generative LLM.

The voice is intentionally unified. Another Brain does not split public persona from private tone; personal calibration is part of the subject, while privacy rules protect raw files, sensitive facts, and local artifacts.

## Privacy Rules

- No cloud inference APIs.
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

The checked-in public runtime ships with hand-written persona calibration, but without raw personal memory cards. Shared public generated files in `web/` are tracked; private local payloads such as `artifacts/` and `web/brain_pack.js` are ignored by git.

## Local Build Workflow

Build and validate a private local memory pack:

```bash
python3 scripts/scan_drive.py --source "/path/to/local/source" --out-dir artifacts
python3 scripts/build_brain_pack.py --source "/path/to/local/source" --inventory artifacts/t7_inventory.jsonl --out-dir artifacts --web-dir web
python3 scripts/validate_brain_pack.py --brain-pack artifacts/brain_pack.json
```

Build shared browser knowledge and the tiny router:

```bash
npm run build:knowledge
python3 scripts/build_distillation_dataset.py
python3 scripts/train_tiny_router.py
```

Run the local gates:

```bash
python3 scripts/validate_distillation.py
python3 scripts/eval_tiny_router.py
python3 scripts/bench_knowledge_runtime.py
python3 scripts/validate_training_os.py
python3 scripts/eval_dialog_persona.py
node scripts/run_model_gate_node.mjs --out /tmp/another_brain_model_gate.json
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

Run the launch-readiness detector:

```bash
npm run check:launch-readiness
```

## Current Gate Snapshot

- Distillation dataset: 76365 rows, 74580 train, 1785 eval.
- Tiny router web artifact: 1871095 bytes, observed only. Production blocking is loaded-page answer latency, not router byte size.
- Tiny router feature weights: 18000.
- Tiny router answer index: 787.
- Tiny router route accuracy: 0.9372.
- Tiny router family-holdout accuracy: 0.9467 across 6833 held-out examples from unseen source/tag/id families.
- Relationship repetition gate: 16/16 turns passed.
- Knowledge runtime: 55151 generated cards, 55284 total runtime cards, p95 0.231ms and p99 0.324ms on the last local run.
- Knowledge web artifact: 7645757 bytes.
- Knowledge shards: 43 static JSON shards, max shard size 179996 bytes, round-trip validated against `web/knowledge_base.generated.js`.
- Dialog persona eval: 742 cases, including 16 surface-identity cases, 0 failures.
- Help/onboarding eval: 23/23 passed, no fallback answers, no assistant-tone hits.
- R2 split manifest: 7 datasets, 140 public/style metadata cases, family-held-out 70/15/15 train/dev/blind split, blind cases not used for training.
- Frontend loaded-page answer latency gate: every sampled prompt must answer within 1500ms after submit.
- Context-window gate: UI shows 4 recent turns; hidden reasoning keeps 12 turns.
- Context stress suite: 100 groups, 1600 questions, 1500 context assertions, 485 required context-delta checks.
- Context stress distribution: 20 single-topic groups, 39 adjacent-bridge groups, 21 soft multi-insert groups, 20 hard-mixed groups.
- Context stress gate: coverage 1.0000, required context-delta ratio 1.0000, 0 failures.
- Casepack capability eval: 10 casepacks, 160 questions, average score 1.0000, 0 failures.
- Clone logic/ethics held-out eval: 30 real-event-derived casepacks, 480 turns, 16 judgment actions, structure gate passed.
- Model gate: 805/805 passed, 37/37 Web SLM cases passed.
- Tiny router memory answers in the public exact index: 0.

## Repository Contents

- `web/`: static browser app and public runtime modules.
- `web/tiny_router.js`: browser-side Web SLM wrapper.
- `web/tiny_router_model.generated.js`: compact generated tiny-router artifact.
- `web/knowledge_base.generated.js`: monolithic generated common-knowledge cards kept for the current synchronous runtime path.
- `web/knowledge_shards/`: static shard JSON files and manifest for CDN-friendly deployment and future lazy loading.
- `web/context_stress_cases.json`: 100x16 mixed context stress cases for training calibration.
- `web/structured_decision.js`: structured route, evidence sufficiency, and answer verifier helper.
- `evals/casepacks/`: synthetic casepack-16 capability evals.
- `evals/clone_logic_ethics/`: held-out real-event-derived clone judgment stress eval; not training data.
- `docs/clone_training_strategy.md`: training plan for the bounded subject-copy direction.
- `docs/release_governance.md`: production launch gates, milestone rules, freeze policy, and final review thresholds.
- `evals/release_policy/release_status.json`: current release-governance status; production is locked until R0-R7 pass.
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

The launch target is static Vercel hosting for `efishother.com`. Vercel should not run model inference, generate memory packs, or build private artifacts. The checked-in `vercel.json` uses `web/` as the output directory and runs only the release preflight.

Before deploying:

```bash
npm run check
```

`npm run check:release` is intentionally lighter and suitable as a Vercel build command. `npm run check` is the fuller local gate.

Passing `npm run check` is necessary but not sufficient for production. Final
production review is locked by `docs/release_governance.md`: R0-R7 must pass,
critical failures must remain 0, and the production runtime budget must be met
before `evals/release_policy/release_status.json` can set
`final_release_allowed` to `true`.

## License

Copyright (c) 2026 Dai Pan / dpan538. All rights reserved.

This repository is source-available only. You may view and fork the repository under GitHub's Terms of Service, but no permission is granted to use, copy, modify, distribute, sublicense, train on, deploy, or create derivative works from the source code, generated artifacts, model artifacts, datasets, personal calibration data, or local memory artifacts unless a separate written license grants those permissions.

Private local artifacts, including `artifacts/**`, `web/brain_pack.js`, local memory packs, drive inventories, model checkpoints, LoRA adapters, local model weights, and source materials, are not distributed and are not licensed.

## Training Direction

The next training work should improve the tiny router Web SLM directly.

The training policy is now frozen in `docs/release_governance.md`. The governing
question for every cycle is whether the runtime is becoming more like the
dialog box, not whether it is becoming a generic AI assistant.

Identity/background growth should start from `identity_pack/`: raw interview
answers stay local, cards get visibility labels, and only redacted public or
allowed cards should enter the browser runtime. The model should inherit
language habits and judgment style; it should not memorize private facts in
weights.

Launch budget:

- Tiny router Web SLM should stay above a 1.5MB capability floor before first launch; the current practical ceiling is 2.5MB unless mobile profiling says otherwise.
- Knowledge lookup should stay comfortably sub-millisecond, with p99 under 1ms on local gates.
- Growth should come from better daily dialog, reasoning, and personal-calibration cases, not from a generative fallback.

The priority order is:

1. Keep the tiny router Web SLM fast and authoritative.
2. Expand high-signal dialog and reasoning coverage beyond the 1.5MB router floor while keeping mobile load acceptable.
3. Add more targeted correction pairs for drift points.
4. Keep the browser gate as the release boundary.

LoRA experiments are historical research artifacts and are not required for launch.
