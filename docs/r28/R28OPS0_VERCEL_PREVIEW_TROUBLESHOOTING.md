# R28OPS0 Vercel Preview Troubleshooting

This checklist is for evidence-based preview triage. Do not guess the remote cause. Capture exact local command output and Vercel deployment details.

## Deployment Identity

Record:

- Branch: `r28ops0-release-ops-runbook` or the PR branch being previewed.
- SHA: `git rev-parse HEAD`
- PR URL.
- Vercel deployment URL.
- Vercel deployment id.
- Commit author and deployment time.

## Build Settings

Tracked settings:

- Build command: `npm run build:vercel`
- Output directory: `web`
- Framework: static / `framework: null`

Dashboard/default settings to confirm:

- Install command: Vercel default unless dashboard overrides it.
- Root directory: repository root unless dashboard overrides it.
- Node version: dashboard/project default unless an engine override is configured.
- Package manager: Vercel default unless lockfile or dashboard override says otherwise.

If a dashboard override differs from tracked config, paste the override value into the incident note.

## First Failing Command

Copy the first failing command exactly from Vercel logs. Classify it as one of:

- dependency install.
- `npm run build:vercel`.
- `node scripts/prepare_vercel_static_build.mjs`.
- `npm run check:knowledge-runtime`.
- `npm run check:vercel-build`.
- static route serving after build.

Run the matching local command in a clean worktree and compare output.

## Environment Variables

Expected for this static shell:

- No backend inference secret.
- No external LLM API key.
- No Doubao key.
- No hosted vector store credentials.
- No runtime env var required to render the static shell.

If Vercel has env vars configured, confirm they are not used by `web/another_brain_chat` or `web/another_brain` static runtime paths.

## Static File Count And Bundle Size

Run locally:

```bash
npm run build:vercel
python3 scripts/r27b4_bundle_report.py
```

Expected from the latest E1 baseline:

- Static file count: `158`
- Build output bytes: `22251715`
- Max static bytes: `100000000`
- Model declared bytes: `0`
- Tokenizer declared bytes: `0`

If Vercel reports a different static file count or bundle size, compare the deployed SHA, root directory, and build command first.

## Asset Manifest

Inspect:

```bash
cat web/another_brain/asset_manifest.json
cat web/another_brain/runtime_mode.json
```

Expected:

- `same_origin_only: true`
- `external_runtime_dependency: false`
- `backend_inference: false`
- `model_assets: []`
- `tokenizer_assets: []`
- `product_model: false`
- `product_admission: false`
- `browser_admission: false`
- `release_checkpoint: false`

Any external asset URL, path traversal, model/tokenizer asset admission, backend inference flag, or hosted vector store flag is a blocker.

## Route Checks

Check:

- Preview root route loads.
- Static chat route loads.
- Runtime JS request returns JavaScript, not HTML or 404.
- `runtime_mode.json` and `asset_manifest.json` are served from same-origin static paths.
- The chat UI shows local-only and non-product warnings.

If local route smoke is blocked by sandbox networking, do not call that a product regression. Use static file checks locally and Vercel preview URL checks remotely.

## Dashboard Overrides To Inspect

- Build command override.
- Install command override.
- Output directory override.
- Root directory override.
- Node version override.
- Framework preset override.
- Ignored build step.
- Environment variables.
- Deployment protection or preview auth settings.

## Escalation Notes

When asking for help, include:

- branch/SHA.
- first failing command.
- local command output.
- Vercel build log excerpt.
- static file count and bundle size.
- asset manifest summary.
- whether root route or chat route fails.
- whether failure occurs before or after `npm run build:vercel`.
