# R27D2 Vercel log capture template

The Gmail failure notification confirms only that a preview deployment failed. It does not show the cause. Paste the Vercel Deployment Details and Build Logs into this template before assigning root cause.

## Deployment details

- Deployed branch:
- Commit SHA:
- Vercel project:
- Vercel team/account:
- Root directory:
- Framework preset:
- Install command:
- Build command:
- Output directory:
- Node.js version:
- Package manager:
- Vercel dashboard overrides of `package.json` or `vercel.json`:
- Ignored build step configured:
- Environment variable errors, if any:

## First failure

- First failing command:
- Exit code:
- Build phase:
  - install
  - build
  - output validation
  - deployment finalization
- Complete stack trace or log block around first failure:

```text
PASTE LOG BLOCK HERE
```

## Expected repo-local values

- Branch expected for preview: `r27d1-preview-deploy-readiness`
- Build command expected: `npm run build:vercel`
- Output directory expected: `web`
- Local bundle size: `22,202,171` bytes
- Static budget: under `100,000,000` bytes
- Backend inference: absent
- External LLM/Doubao/vector-store wiring: absent
- Model/tokenizer/artifact commits: absent

## Interpretation rule

If the log shows an old branch/SHA, wrong root directory, dashboard build-command override, wrong output directory, incompatible Node version, or install failure unrelated to repo build config, fix the Vercel project setting or rerun the preview from the correct branch.

If the log shows the current branch using `npm run build:vercel` and still failing, patch the branch from the first failing command and rerun the local D2 merge guard.
