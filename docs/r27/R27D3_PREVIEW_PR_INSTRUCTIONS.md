# R27D3 preview PR instructions

Open a PR with:

- Base: `main`
- Head: `r27d3-unified-static-delivery`
- Title: `R27D3 unified static delivery integration`

Manual PR URL:

`https://github.com/dpan538/another_brain/compare/main...r27d3-unified-static-delivery?expand=1`

## Recommendation

Prefer this D3 PR over separate D2, C0, B8, or E0 PRs because D3 resolves the overlapping static frontend, deploy readiness, adapter bridge, cache status, and demo QA surfaces into one previewable branch.

Do not merge raw A-line branches and do not merge raw B5 if that path brings training artifacts, training registries, model weights, tokenizer artifacts, corpus payloads, or A-line worktree files.

## Before merge

1. Run the D3 local verification commands.
2. Open the D3 PR to `main`.
3. Wait for Vercel preview to pass.
4. If preview fails, inspect the Vercel Deployment Details Build Logs.
5. If preview fails, collect the build log fields listed in `docs/r27/R27D2_VERCEL_LOG_CAPTURE_TEMPLATE.md`.
6. Patch from the first failing command, not from the Gmail notification alone.

## Local verification commands

```sh
npm run test:r27d3
npm run test:r27d2
npm run test:r27c0
npm run test:r27b8
npm run test:r27e0
npm run build
npm run build:vercel
python3 scripts/r27d3_integration_audit.py
python3 scripts/r27e0_acceptance_check.py
```

## Non-claims

Opening this PR does not approve product model admission, browser admission, a release checkpoint, backend inference, external LLM API use, Doubao, hosted vector storage, training, model weight commits, tokenizer artifact commits, or exported shard commits.
