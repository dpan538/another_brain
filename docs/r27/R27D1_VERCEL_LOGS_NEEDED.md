# R27D1 Vercel logs needed

The Gmail screenshot only confirms that a preview deployment failed. It does not identify the cause.

R27D0 and R27D1 local checks now pass from the repository side, so the Vercel Deployment Details build log is the missing evidence needed to decide whether the remaining failure is caused by project settings, an old branch/SHA, install environment, Node version, output directory handling, or another non-local condition.

## Required Vercel evidence

Open the failed preview deployment in Vercel and capture the Build Logs plus Deployment Details for:

1. Branch name deployed.
2. Commit SHA deployed.
3. Build command Vercel actually used.
4. Install command Vercel actually used.
5. Output directory Vercel expected.
6. First failing command.
7. Exit code from the first failing command.
8. Complete stack trace or error block around the first failure.
9. Vercel project root directory.
10. Node.js version used by Vercel.
11. Whether Vercel project settings override `vercel.json` or `package.json`.
12. Whether the failed deployment read `vercel.json` from the R27D0/D1 branch.

## Why this matters

Not merging a branch into `main` explains why production does not update. It does not by itself explain a preview deployment failure, because Vercel creates previews for non-production branch pushes and PRs.

Without the build log, the strongest available evidence is local:

- `npm run build`: PASS
- `npm run build:vercel`: PASS
- `python3 scripts/r27d1_preview_readiness.py`: PASS
- Output directory: `web`
- Bundle size: `22,202,171` bytes
- Static-only runtime: PASS
- Backend inference: absent
- External LLM/Doubao/vector-store wiring: absent
- Tracked weights/tokenizers/artifacts: absent

If the Vercel log shows `npm run build:vercel` on the current D1 branch and still fails, patch from the first failing command. If it shows an older branch/SHA, wrong root directory, wrong output directory, dashboard override, missing Node setting, or different build command, fix the Vercel project or rerun the preview from the correct branch.

## Non-claims

This document does not claim the failed preview was caused by not merging `main`; it also does not claim a product model, backend inference, external LLM API, Doubao integration, hosted vector store, model weights, tokenizer artifacts, or phase 4 approval.
