# R28PR1 Preview Verification Summary

## Scope

- Target base: `main`
- Target head: `r28pr0-final-preview-pr`
- Verification branch: `r28pr1-preview-verification`
- Verified commit: `0454a3eef386cd1b64b0ee85239a0c736b0ab6e7`
- Source: `origin/r28pr0-final-preview-pr`

R28PR1 does not train, change model assets, merge `main`, or approve any admission step.

## Local Gate Status

Passed:

- `npm run build`
- `npm run build:vercel`
- `npm run check:r27b0-static-budget`
- `npm run check:r27b0-static-only`
- `npm run check:no-training-in-routine-gates`
- `npm run check:training-approval-markers`
- `python3 scripts/r27b4_bundle_report.py`
- `git diff --check`
- `git diff --cached --check`
- `git show --check HEAD`

Bundle report:

- `ok`: true
- `build_output_bytes`: `20,676,178`
- `margin_bytes`: `79,323,822`
- `max_total_static_bytes`: `100,000,000`
- `model_declared_bytes`: `48,306,593`
- `tokenizer_declared_bytes`: `998,388`
- `backend_inference`: false
- `external_llm_api`: false
- `product_model`: false

## PR And Checks Status

- PR existence: manual verification required.
- Reason: local `gh` CLI is unavailable and `GITHUB_TOKEN` is not present.
- PR URL: unknown from local automation.
- Manual PR list URL: `https://github.com/dpan538/another_brain/pulls`
- Manual compare URL: `https://github.com/dpan538/another_brain/compare/main...r28pr0-final-preview-pr?expand=1`
- GitHub checks: unavailable from local automation.
- Vercel preview status: unavailable from local automation.
- Preview URL: unknown.

## Decision Label

`checks_unavailable_manual_review_needed`

## Manual Review Path

1. Confirm the PR exists with base `main` and head `r28pr0-final-preview-pr`.
2. Open the GitHub checks panel for the PR.
3. Locate Vercel, Preview, or Deployment checks.
4. If checks pass, open the preview URL and perform manual QA.
5. If a Vercel check fails, copy the fields listed in `docs/r28/R28PR1_VERCEL_FAILURE_LOG_REQUEST.md`.

## Release Blockers

- Product admission not done.
- Browser admission not done.
- Release checkpoint admission not done.
- Vercel preview status is unavailable until GitHub/Vercel checks are manually reviewed.
- Manual preview QA is not done.
- `phase_4` remains false.

## Non-Claims

- No product model admission.
- No product admission.
- No browser admission.
- No release checkpoint admission.
- No phase 4 approval.
- No backend inference.
- No Vercel Function or Edge inference.
- No external LLM API.
- No Doubao.
- No hosted vector store.
- No training.
- No automatic merge.
