# R27D0 Vercel deploy triage

R27D0 creates a deployable integration branch for the B-line static delivery path and keeps A-line training artifacts out of the merge target.

## Branch and merge scope

- Integration branch: `r27d0-vercel-deploy-triage`
- Base: `origin/main` at `be76a4a`
- B5 source: `origin/r27b5-bind-handoff-budget-gate` at `37dfbfd`
- Full `git merge --no-ff --no-commit origin/r27b5-bind-handoff-budget-gate` was clean, but it staged A2-A6 training files, training registry files, and training approval markers.
- The full merge was aborted. R27D0 selectively restores the B-line/static delivery path from B5 instead:
  - `docs/r27/R27B*`
  - `scripts/r27b*`
  - `src/browser_export/`
  - `src/browser_runtime/`
  - `tests/r27b*`
  - `web/another_brain/`
  - `web/another_brain_chat/`
  - `.gitignore`
- `package.json` was updated manually for B-only scripts and the Vercel build fix, without adding A2-A6 training scripts.

## Build configuration

- `vercel.json`:
  - `framework`: `null`
  - `buildCommand`: `npm run build:vercel`
  - `outputDirectory`: `web`
  - `rewrites`: none
  - `functions` / `routes`: absent
- `package.json`:
  - `build`: `npm run build:vercel`
  - `build:vercel`: `node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build`
  - R27B0-B5 local test/check scripts restored.
  - `check:r27d0-vercel-deploy-triage`: `npm run test:r27d0 && python3 scripts/r27d0_vercel_config_audit.py`

## Local results

All commands below were run from `/private/tmp/another_brain_r27d0`.

| Command | Result |
| --- | --- |
| `npm run test:r27b5` | PASS, 9 tests |
| `npm run test:r27b4` | PASS, 8 tests |
| `npm run check:r27b0-static-budget` | PASS |
| `npm run check:r27b0-static-only` | PASS |
| `npm run check:no-training-in-routine-gates` | PASS, 379 routine scripts and 232 orchestrator files checked, no training rerun paths |
| `npm run check:training-approval-markers` | PASS, active training/tokenizer/product/weight/phase4 approval counts are 0 |
| `npm run build` | PASS, delegates to `npm run build:vercel` |
| `npm run build:vercel` | PASS |
| `python3 scripts/r27b4_bundle_report.py` | PASS |
| `python3 scripts/r27d0_vercel_config_audit.py` | PASS |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS |

`npm run build` no longer triggers the heavyweight release gate or any training script. It invokes `npm run build:vercel`; in a non-Vercel local environment `prepare_vercel_static_build.mjs` reports `{"skipped": true, "reason": "not_vercel_build"}` and then runs knowledge-runtime and Vercel static build checks.

## Static bundle

- Output directory: `web`
- Deployable static files: `157`
- Deployable static bytes: `22,202,171`
- 100MB budget: `100,000,000`
- Margin: `77,797,829`
- Declared model bytes: `0`
- Declared tokenizer bytes: `0`
- RAG asset bytes: `2,065`
- Gate asset bytes: `609`
- Backend inference: `false`
- External LLM API: `false`
- Product model: `false`

## Vercel CLI status

`vercel` is not installed in the local environment and `.vercel/project.json` is absent in the R27D0 worktree, so `vercel build` was not run. The local replacement evidence is `npm run build`, `npm run build:vercel`, `check:vercel-build`, and the R27D0 config audit.

## Non-claims

R27D0 does not train, download weights, commit weights, commit tokenizer artifacts, commit exported or quantized shards, attach backend inference, attach Vercel Function or Edge inference, call external LLM APIs, attach Doubao, attach hosted vector storage, parse root DOCX/PDF files, parse `data/public_ingestion`, claim a product model, or approve phase 4.
