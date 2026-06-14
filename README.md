# Another Brain

Another Brain is a local-first second brain experiment with a tiny browser-side language layer. It turns allowed local materials into redacted memory structures, then answers through deterministic dialog rules, static knowledge lookup, and a compact tiny router that acts as a route-and-answer Web SLM.

The public UI is intentionally small: one input box, no account, no cloud inference, and no remote LLM call. The browser path is designed to stay light enough for mobile devices.

Launch domain: `efishother.com`.

GitHub description: `Local-first browser-side dialog runtime: deterministic rules, static knowledge cards, and a route-and-answer Web SLM with no cloud inference.`

## Runtime Shape

The router owns control flow. A larger local LLM is not part of the first public runtime. Vercel is used only for static hosting.

```text
user input
  -> deterministic dialog rules
  -> generated static knowledge cards
  -> tiny router Web SLM
  -> short fallback answer
```

The tiny router is not a general generative model. It is a character n-gram classifier plus conservative answer index: a compact route-and-answer layer trained from the public dialog teacher, model-gate cases, correction pairs, common knowledge cards, reasoning/counterquestion calibration, context-window calibration, relationship-repetition calibration, and persona alignment. In the current public gate, 741/778 cases are direct rule or knowledge answers, and 37/778 use the tiny router Web SLM.

WebLLM is intentionally out of the first public runtime. It does not accelerate the tiny router classifier, and previous local checks showed that the small generative fallback was too likely to drift or hallucinate in open dialog. The reliable path is to train the tiny router directly and keep unknown questions, privacy-sensitive questions, and route misses controlled by deterministic rules.

The reasoning path is deliberately small. It trains the SLM to choose a response strategy, not to expose long chain-of-thought: missing premise, ask for the premise; unclear direction, counterquestion; encyclopedia request, send the user to search; uncertain memory, answer with bounded uncertainty.

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
python3 scripts/build_knowledge_base.py
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

## Current Gate Snapshot

- Distillation dataset: 74593 rows, 72808 train, 1785 eval.
- Tiny router web artifact: 1717935 bytes.
- Tiny router feature weights: 18000.
- Tiny router answer index: 775.
- Tiny router route accuracy: 0.9382.
- Tiny router holdout accuracy: 0.9869.
- Relationship repetition gate: 16/16 turns passed.
- Knowledge runtime: 55151 generated cards, 55284 total runtime cards, p95 0.231ms and p99 0.324ms on the last local run.
- Knowledge web artifact: 7645757 bytes.
- Dialog persona eval: 714 cases, 0 failures.
- Context-window gate: UI shows 4 recent turns; hidden reasoning keeps 12 turns.
- Context stress suite: 100 groups, 1600 questions, 1500 context assertions, 485 required context-delta checks.
- Context stress distribution: 20 single-topic groups, 39 adjacent-bridge groups, 21 soft multi-insert groups, 20 hard-mixed groups.
- Context stress gate: coverage 1.0000, required context-delta ratio 1.0000, 0 failures.
- Model gate: 778/778 passed, 37/37 Web SLM cases passed.
- Tiny router memory answers in the public exact index: 0.

## Repository Contents

- `web/`: static browser app and public runtime modules.
- `web/tiny_router.js`: browser-side Web SLM wrapper.
- `web/tiny_router_model.generated.js`: compact generated tiny-router artifact.
- `web/knowledge_base.generated.js`: generated common-knowledge cards.
- `web/context_stress_cases.json`: 100x16 mixed context stress cases for training calibration.
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

## License

Copyright (c) 2026 Dai Pan / dpan538. All rights reserved.

This repository is source-available only. You may view and fork the repository under GitHub's Terms of Service, but no permission is granted to use, copy, modify, distribute, sublicense, train on, deploy, or create derivative works from the source code, generated artifacts, model artifacts, datasets, personal calibration data, or local memory artifacts unless a separate written license grants those permissions.

Private local artifacts, including `artifacts/**`, `web/brain_pack.js`, local memory packs, drive inventories, model checkpoints, LoRA adapters, local model weights, and source materials, are not distributed and are not licensed.

## Training Direction

The next training work should improve the tiny router Web SLM directly.

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
