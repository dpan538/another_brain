# R27D2 manual PR steps

Use these steps because the local environment does not currently have the GitHub CLI.

## Confirm whether PR exists

1. Open `https://github.com/dpan538/another_brain/pulls`.
2. Search open and closed PRs for head branch `r27d1-preview-deploy-readiness`.
3. Confirm the base branch is `main`.
4. Confirm the latest branch commit includes `c42857a56b8953d1ffbd2abd53ffae9f336f62eb` or a later D1-compatible commit.

## Create PR if missing

Open:

`https://github.com/dpan538/another_brain/compare/main...r27d1-preview-deploy-readiness?expand=1`

Use:

- Base: `main`
- Head: `r27d1-preview-deploy-readiness`
- Title: `R27D1 preview deployment readiness`
- Body source: `docs/r27/R27D1_PREVIEW_DEPLOYMENT_READINESS.md`

Add links or copied content from:

- `docs/r27/R27D1_MAIN_MERGE_GUARD.md`
- `docs/r27/R27D2_VERCEL_LOG_CAPTURE_TEMPLATE.md`
- `docs/r27/R27D2_MAIN_MERGE_CHECKLIST.md`

## Do not merge yet

Do not merge until one of these is true:

- The Vercel preview deployment for the PR passes.
- The Vercel Deployment Details Build Log proves the failure is caused by a dashboard/project setting or other non-repo cause, and that issue has been corrected.

Do not merge raw B5 directly into `main`, because that path risks bringing A-line training files, training approvals, weights, tokenizers, corpus payloads, or artifacts into production.

## Non-claims

These PR steps do not approve training, product model admission, model weights, tokenizer artifacts, backend inference, external LLM/Doubao wiring, hosted vector storage, root DOCX/PDF parsing, `data/public_ingestion` parsing, or phase 4.
