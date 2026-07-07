# R27D1 preview deployment readiness

R27D1 validates the R27D0 deployment integration branch for preview deployment readiness without training, model downloads, backend inference, Vercel Function or Edge inference, external LLM APIs, Doubao, hosted vector storage, root DOCX/PDF parsing, or `data/public_ingestion` parsing.

## Branch and PR state

- Working branch: `r27d1-preview-deploy-readiness`
- Base branch for this worktree: `origin/r27d0-vercel-deploy-triage`
- R27D0 source commit: `f55869f459ec8acddd075c78334034baca52a936`
- `gh` CLI: unavailable locally, so PR existence could not be verified from this machine.
- `vercel` CLI: unavailable locally, so `vercel build` was not run.

Manual PR check or creation:

1. Open `https://github.com/dpan538/another_brain/pulls`.
2. Search for head branch `r27d0-vercel-deploy-triage` or `r27d1-preview-deploy-readiness` targeting `main`.
3. If no PR exists, open:
   `https://github.com/dpan538/another_brain/compare/main...r27d1-preview-deploy-readiness?expand=1`
4. Title: `R27D1 preview deployment readiness`
5. Body: use `docs/r27/R27D1_PREVIEW_DEPLOYMENT_READINESS.md` and `docs/r27/R27D1_MAIN_MERGE_GUARD.md`.

Do not merge the PR until preview deployment either passes or the Vercel build log shows a non-repo cause.

## Build configuration

- `package.json` `build`: `npm run build:vercel`
- `package.json` `build:vercel`: `node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build`
- `vercel.json` `framework`: `null`
- `vercel.json` `buildCommand`: `npm run build:vercel`
- `vercel.json` `outputDirectory`: `web`
- `vercel.json` `functions`: absent
- `vercel.json` `routes`: absent

The package build path no longer invokes `check:release`, training, tokenizer training, corpus generation, model export, or model weight admission. The R27D1 readiness gate also removed the B2 runtime dependency on `src.training` by using local static config estimation and tensor shape compatibility checks inside `src/browser_export`.

## Local verification

Commands were run from `/private/tmp/another_brain_r27d0`.

| Command | Result |
| --- | --- |
| `npm run test:r27b5` | PASS, 9 tests |
| `npm run test:r27b4` | PASS, 8 tests |
| `npm run test:r27b3` | PASS, 13 tests |
| `npm run test:r27b2` | PASS, 7 tests |
| `npm run test:r27b1c` | PASS, 7 tests |
| `npm run test:r27b1b` | PASS, 9 tests |
| `npm run test:r27b1a` | PASS, 11 tests |
| `npm run test:r27b0` | PASS, 8 tests |
| `npm run test:r27d1` | PASS, 3 tests |
| `npm run check:r27b0-static-budget` | PASS |
| `npm run check:r27b0-static-only` | PASS |
| `npm run check:no-training-in-routine-gates` | PASS, no training rerun paths |
| `npm run check:training-approval-markers` | PASS, active training/tokenizer/corpus/product/weight/phase4 counts are 0 |
| `npm run build` | PASS, delegates to `npm run build:vercel` |
| `npm run build:vercel` | PASS |
| `python3 scripts/r27b4_bundle_report.py` | PASS |
| `python3 scripts/r27d1_preview_readiness.py` | PASS |

## Static bundle

- Output directory: `web`
- Static file count: `157`
- Deployable static bytes: `22,202,171`
- 100MB budget: `100,000,000`
- Budget margin: `77,797,829`
- Declared model bytes: `0`
- Declared tokenizer bytes: `0`
- RAG demo asset bytes: `2,065`
- Gate asset bytes: `609`
- Admitted static LLM assets: `0`

## Route readiness

The local sandbox blocks binding the temporary HTTP server used by the R27B1C rehearsal route smoke, so R27D1 used the static-file fallback route check.

| Route | Source | Status |
| --- | --- | --- |
| `/` | `web/index.html` | PASS, 200-equivalent static file check |
| `/another_brain_chat/` | `web/another_brain_chat/index.html` | PASS, 200-equivalent static file check |
| `/another_brain_chat/browser_runtime.js` | `web/another_brain_chat/browser_runtime.js` | PASS, 200-equivalent static file check |

All expected route markers were present.

## Readiness conclusion

The repo-local build configuration is no longer the likely cause of the preview failure based on current local evidence:

- `npm run build` and `npm run build:vercel` pass.
- `vercel.json` and `package.json` agree on `npm run build:vercel`.
- Output directory `web` exists and passes static validation.
- Static-only and static-budget gates pass.
- No API route, backend inference route, Vercel Function, Edge Function, external model URL, Doubao endpoint, or hosted vector store config was found.
- No tracked model weights, tokenizer artifacts, exported shards, quantized shards, raw/clean public samples, training mix, root DOCX/PDF, or `data/public_ingestion` payloads were found.

If Vercel preview still fails, the next action is to inspect the Vercel Deployment Details build log and patch the branch from the first failing command, not to guess from the Gmail notification.

## Non-claims

R27D1 does not claim a product model, backend inference, external LLM API, Doubao integration, hosted vector store, root DOCX/PDF parsing, `data/public_ingestion` parsing, model training, tokenizer training, weight admission, or phase 4 approval.
