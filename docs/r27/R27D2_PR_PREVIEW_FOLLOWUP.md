# R27D2 PR preview follow-up

R27D2 turns the R27D1 deployment branch into an executable follow-up path for PR creation, preview log capture, and main merge readiness. It does not train, download model weights, commit weights/tokenizers/artifacts, add backend inference, add external LLM/Doubao wiring, parse root DOCX/PDF files, parse `data/public_ingestion`, or touch the A12 worktree.

## Branch state

- Follow-up branch: `r27d2-pr-preview-followup`
- Created from: `origin/r27d1-preview-deploy-readiness`
- Target PR branch to verify or create: `r27d1-preview-deploy-readiness`
- PR base: `main`

The primary worktree at `/Users/jarlgiovanni/Desktop/another_brain` contains unrelated A-line/root document/public-ingestion changes, so R27D2 work was kept in the clean worktree at `/private/tmp/another_brain_r27d0`.

## PR status logic

Run:

```sh
python3 scripts/r27d2_pr_status.py
```

The script:

1. Checks whether `gh` is installed.
2. If `gh` is installed, checks authentication with `gh auth status`.
3. If authenticated, runs `gh pr list --head r27d1-preview-deploy-readiness --base main`.
4. If no PR exists, creates one with base `main`, head `r27d1-preview-deploy-readiness`, and title `R27D1 preview deployment readiness`.
5. If `gh` is missing or unauthenticated, emits the manual PR checklist and compare URL.

The local environment currently has no `gh` CLI, so manual PR confirmation is required.

## Vercel dashboard override risks

Local repo evidence says the deployment build config is ready, but the Vercel dashboard can still override branch behavior. Check Project Settings for:

- Root Directory: should point to the repository root unless intentionally changed.
- Framework Preset: should not force a framework build path that conflicts with `vercel.json`.
- Build Command: should be empty or `npm run build:vercel`; it must not override to `npm run build` from an old branch or `npm run check:release`.
- Output Directory: should be empty or `web`.
- Install Command: should not run training, model download, tokenizer training, corpus generation, or artifact admission.
- Node.js Version: should be compatible with the local passing build.
- Ignored Build Step: should not skip or mutate the D1 preview unexpectedly.
- Environment Variables: should not introduce external LLM, Doubao, hosted vector store, backend inference, or model download behavior.

If the Vercel preview still fails after D1/D2 local checks pass, use Deployment Details Build Logs to identify the first failing command. Do not infer the cause from the Gmail notification alone.

## Local commands

R27D2 adds:

- `scripts/r27d2_pr_status.py`
- `scripts/r27d2_main_merge_guard.py`
- `tests/r27d2/test_pr_status.py`
- `tests/r27d2/test_main_merge_guard.py`
- `npm run test:r27d2`
- `npm run check:r27d2-pr-preview-followup`

The main merge guard can be run directly:

```sh
python3 scripts/r27d2_main_merge_guard.py
```

It verifies the R27D1 readiness audit and runs the required local build/static commands:

- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`

## Decision rule

Open or confirm the PR for `r27d1-preview-deploy-readiness` into `main`. Wait for the preview deployment. Merge only when the preview passes or when the Vercel build log proves a non-repo cause and the branch has been patched or the project setting has been corrected.

Do not merge raw B5 directly into `main`.

## Non-claims

R27D2 does not claim a product model, backend inference, Vercel Function or Edge inference, external LLM API, Doubao integration, hosted vector store, model weights, tokenizer artifacts, root DOCX/PDF parsing, `data/public_ingestion` parsing, or phase 4 approval.
