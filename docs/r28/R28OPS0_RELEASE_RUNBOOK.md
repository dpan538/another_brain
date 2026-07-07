# R28OPS0 Release Runbook

R28OPS0 is a release-operations wrapper for the R28 prelaunch static shell. It does not train, does not change core runtime code, does not add model assets, does not connect backend/external LLM/Doubao runtime, does not do product admission, and does not merge `main`.

## Branch To PR

- Source branch: `r28ops0-release-ops-runbook`
- Intended PR target: the current integration target selected by the maintainer, normally the R28 prelaunch integration branch or `main` after human review.
- Do not merge `main` into this branch during OPS0.
- Before opening the PR, confirm:
  - `git status --short --branch`
  - `git log --oneline --decorate -5`
  - `git diff --stat origin/r28e1-prelaunch-acceptance-matrix...HEAD`

## Required Checks

Run these locally before requesting preview review:

```bash
npm run build
npm run build:vercel
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
npm run check:training-approval-markers
git diff --check
git diff --cached --check
git show --check HEAD
```

Recommended prelaunch confidence checks:

```bash
npm run test:r28e1
python3 scripts/r28e1_acceptance_matrix.py --no-write-report
npm run test:r27e0
npm run test:r27c0
npm run test:r27b8
```

## Vercel Preview Validation

Expected project settings from tracked config:

- Framework preset: static / `framework: null`
- Build command: `npm run build:vercel`
- Output directory: `web`
- Root directory: repository root unless the Vercel dashboard overrides it.
- Install command: Vercel default unless the dashboard overrides it.

Preview validation steps:

1. Confirm the deployment branch and SHA match the PR head.
2. Confirm the first failing command, if any, is copied from Vercel build logs.
3. Confirm the build uses `npm run build:vercel`.
4. Confirm output directory is `web`.
5. Open the preview root route and chat route.
6. Verify the chat page shows local/static badges, non-product warning, budget status, current route, evidence drawer, and adapter import controls.
7. Run the manual QA steps below against the preview URL.

Preview is not considered passed until a human has checked the deployed URL. Local `build:vercel` pass is necessary but not sufficient.

## Manual QA Steps

1. Open `/` and confirm the static site loads without a server error.
2. Open `/another_brain_chat/` or the preview route that serves the static chat shell.
3. Confirm visible copy says the shell is local/static and a prelaunch engineering candidate.
4. Submit a Chinese prompt such as `请说明 another_brain browser memory evidence packet 的本地流程。`
5. Confirm the answer status updates and a local synthetic/demo answer or fallback is shown.
6. Expand the evidence panel and confirm evidence is shown as support, not an answer bank.
7. Paste plain text into the adapter import box, import it, and confirm the session-only summary updates.
8. Paste invalid JSON into the JSON tab and confirm a validation error appears.
9. Clear imported context and confirm packet/evidence counts reset.
10. On a narrow mobile viewport, confirm there is no horizontal overflow and controls remain reachable.

## Known Non-Claims

- No product model.
- No product admission.
- No browser admission.
- No release checkpoint admission.
- No backend inference.
- No Vercel Function or Edge inference.
- No external LLM API.
- No Doubao runtime.
- No hosted vector store.
- No committed model weights, tokenizer files, exported shards, or private adapter/context/evidence payloads.

## Release Blockers

Any of these block release or promotion:

- Vercel preview URL has not been validated by a human.
- `npm run build:vercel` fails.
- Bundle report is at or above 100 MB.
- `web/another_brain/runtime_mode.json` claims `product_model`, `product_admission`, `browser_admission`, `backend_inference`, `external_llm_api`, or `hosted_vector_store`.
- `web/another_brain/asset_manifest.json` declares external runtime dependency, backend inference, external asset URLs, path traversal, or unexpected model/tokenizer bytes.
- A model asset, tokenizer, exported shard, root DOCX/PDF, `data/public_ingestion`, or private payload file is tracked.
- Static route or chat route cannot be opened in preview.
- The UI presents product-model or admission language.

## Verify No Backend Or External Runtime

Run:

```bash
npm run check:r27b0-static-only
python3 scripts/r28e1_acceptance_matrix.py --no-write-report
```

Inspect tracked config:

```bash
cat vercel.json
cat web/another_brain/runtime_mode.json
cat web/another_brain/asset_manifest.json
```

Expected markers:

- `backend_inference: false`
- `external_llm_api: false`
- `hosted_vector_store: false`
- no `api/`, `pages/api/`, `app/api/`, `functions/`, or `vercel/functions/` route directory.

## Verify Bundle Under 100MB

Run:

```bash
npm run check:r27b0-static-budget
python3 scripts/r27b4_bundle_report.py
```

Expected:

- `ok: true`
- `build_output_bytes < max_total_static_bytes`
- `model_declared_bytes: 0`
- `tokenizer_declared_bytes: 0`

## Verify No Model Assets Accidentally Committed

Run:

```bash
git ls-files | rg '(^artifacts/|\.(pt|pth|safetensors|ckpt|onnx|gguf)$|(^|/)tokenizer\.(json|model)$|(^|/)raw_public_samples($|/)|(^|/)clean_public_samples($|/)|(^|/)training_mix($|/)|^data/public_ingestion/|^[^/]+\.(docx|pdf)$|(^|/)adapter_payloads($|/)|(^|/)context_payloads($|/)|\.(adapter|context|evidence|state)-packet\.json$)'
```

Known historical allowlist:

- `artifacts/.gitkeep`
- `static_llm/fixtures/tiny_decoder_fixture/tokenizer.json`

No new OPS0 file should appear in that scan.

## Verify Route Works

Local static checks:

```bash
python3 scripts/r28e1_acceptance_matrix.py --no-write-report
```

Preview checks:

- Open the Vercel preview root route.
- Open the static chat route.
- Confirm the chat form, runtime JS, asset manifest, runtime mode, local-only badge, and non-product warning render.
- If preview route smoke is unavailable locally, use the Vercel deployment URL and copy exact deployment errors into the PR notes.
