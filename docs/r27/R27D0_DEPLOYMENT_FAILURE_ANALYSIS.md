# R27D0 deployment failure analysis

The screenshot only shows a Gmail failed preview deployment notification. It is not enough evidence to name a root cause.

## Branch merge explanation

Not merging a branch to `main` explains why production does not update, but it does not by itself explain a failed preview deployment. Vercel creates preview deployments for non-production branch pushes and PRs; that preview should build from that branch's own config and source tree.

So the current failure should be treated as a branch build/config/log issue until the Vercel Deployment Details build log says otherwise.

## Local finding

Before R27D0, `package.json` on the main base had:

- `build`: `npm run check:release`
- `build:vercel`: `node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build`

`vercel.json` already specified:

- `buildCommand`: `npm run build:vercel`
- `outputDirectory`: `web`
- `framework`: `null`

R27D0 makes the package-level build path match the Vercel static path:

- `build`: `npm run build:vercel`

This is a deployment hardening fix. If the failed preview used an old branch, a dashboard override, framework inference, or a build path that ran `npm run build`, the previous package-level `build` could have sent the deployment into the larger release gate. The screenshot alone does not prove that happened; the build log is still required.

## Verified local build evidence

- `npm run build`: PASS
- `npm run build:vercel`: PASS
- `npm run check:vercel-build`: PASS through both build commands
- `python3 scripts/r27d0_vercel_config_audit.py`: PASS
- Output directory: `web`
- Deployable bundle size: `22,202,171` bytes
- Static file count: `157`
- `check:no-training-in-routine-gates`: PASS
- `check:training-approval-markers`: PASS, no active training/tokenizer/product/weight/phase4 approvals
- API/function inference dirs: none found
- Vercel functions/routes config: absent
- External model/LLM wiring: none found
- Hosted vector/storage wiring: none found
- Tracked artifact failures: none

## What to check in Vercel

Open the failed deployment in Vercel Deployment Details and inspect Build Logs for:

- Branch name and commit SHA of the failed preview.
- Whether Vercel used `npm run build:vercel`, `npm run build`, or a dashboard override.
- The first failing command and its exit code.
- Whether the working directory is the repository root.
- Whether the output directory is `web`.
- Whether Vercel read `vercel.json` from the branch.
- Whether the failure happened during install, build, or static output validation.
- Any missing file path, permission, Node version, or environment variable error.

## PR to main recommendation

Open a PR from `r27d0-vercel-deploy-triage` to `main` as the deployment integration branch. Merge it only after the preview for this branch succeeds or after the Vercel build log confirms that any remaining failure is unrelated to the repo build config.

This branch should be preferred over merging raw B5 directly into `main`, because a full B5 merge from current `origin/main` also stages A2-A6 training artifacts. R27D0 carries the B-line static delivery path and the deployment build fix without committing those A-line files.

## Non-claims

This analysis does not claim the failed preview was caused by not merging `main`; it also does not claim a product model, backend inference, external LLM API, Doubao integration, hosted vector store, root DOCX/PDF parsing, `data/public_ingestion` parsing, or phase 4 approval.
