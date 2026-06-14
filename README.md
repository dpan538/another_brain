# Another Brain

Another Brain is a local-first second brain experiment with a tiny browser-side language layer. It turns allowed local materials into redacted memory structures, then answers through deterministic dialog rules, static knowledge lookup, and a compact tiny router that acts as the Web SLM.

The public UI is intentionally small: one input box, no account, no cloud inference, and no remote LLM call. The browser path is designed to stay light enough for mobile devices.

Launch domain: `efishother.com`.

GitHub description: `Local-first tiny browser-side second brain: deterministic rules, static knowledge cards, and a tiny router Web SLM with no cloud inference.`

## Runtime Shape

The router owns control flow. A larger local LLM is not part of the first public runtime.

```text
user input
  -> deterministic dialog rules
  -> generated static knowledge cards
  -> tiny router Web SLM
  -> short fallback answer
```

The tiny router is not a general generative model. It is a compact route-and-answer layer trained from the public dialog teacher, model-gate cases, correction pairs, common knowledge cards, reasoning/counterquestion calibration, and persona alignment. In the current public gate, 694/731 cases are direct rule or knowledge answers, and 37/731 use the tiny router Web SLM.

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

The checked-in public runtime ships without personal memory cards. Shared public generated files in `web/` are tracked; private local payloads such as `artifacts/` and `web/brain_pack.js` are ignored by git.

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

## Current Gate Snapshot

- Distillation dataset: 69635 rows, 67852 train, 1783 eval.
- Tiny router web artifact: 948027 bytes.
- Tiny router route accuracy: 0.9414.
- Tiny router reasoning holdout: 99/99.
- Knowledge runtime: 55041 generated cards, 55174 total runtime cards, p95 0.222ms and p99 0.300ms on the last local run.
- Knowledge web artifact: 7621853 bytes.
- Dialog persona eval: 650 cases, 0 failures.
- Model gate: 731/731 passed, 37/37 Web SLM cases passed.
- Tiny router memory answers in the public exact index: 0.

## Repository Contents

- `web/`: static browser app and public runtime modules.
- `web/tiny_router.js`: browser-side Web SLM wrapper.
- `web/tiny_router_model.generated.js`: compact generated tiny-router artifact.
- `web/knowledge_base.generated.js`: generated common-knowledge cards.
- `scripts/`: local build, validation, training, and gate scripts.
- `models/manifest.json`: tiny-router runtime metadata.
- `artifacts/`: ignored local runtime outputs.

## Training Direction

The next training work should improve the tiny router Web SLM directly.

Launch budget:

- Tiny router Web SLM can grow toward a 1.5MB browser artifact before first launch.
- Knowledge lookup should stay comfortably sub-millisecond, with p99 under 1ms on local gates.
- Growth should come from better daily dialog, reasoning, and personal-calibration cases, not from a generative fallback.

The priority order is:

1. Keep the tiny router Web SLM fast and authoritative.
2. Expand high-signal dialog and reasoning coverage up to the 1.5MB router budget.
3. Add more targeted correction pairs for drift points.
4. Keep the browser gate as the release boundary.

LoRA experiments are historical research artifacts and are not required for launch.
