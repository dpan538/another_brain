# R27D3 branch integration report

## Base

- Base branch: `origin/r27d2-pr-preview-followup`
- New integration branch: `r27d3-unified-static-delivery`
- Worktree: `/private/tmp/another_brain_r27d3`

The primary worktree at `/Users/jarlgiovanni/Desktop/another_brain` was left untouched because it contains unrelated A-line/root DOCX/`data/public_ingestion` changes.

## Integrated sources

- D2: retained from base, including PR follow-up docs, D2 merge guard, and build readiness scripts.
- C0: integrated from `origin/r27c0-external-adapter-packets`.
- B8: integrated from `origin/r27b8-browser-asset-cache`.
- E0: selectively integrated from `origin/r27e0-demo-qa-acceptance`.
- B5 path: preserved from D1/D2 static delivery branch.

## Integration method

- C0 was merged with `git merge --no-ff --no-commit` because its commit scope was static/browser/docs/tests/package only.
- B8 was selectively checked out for docs, tests, browser runtime asset modules, model loader, static manifest/runtime config, and cache test runner.
- E0 was selectively checked out for docs, tests, and `scripts/r27e0_acceptance_check.py`.
- E0 was not raw-merged because its branch diff includes A-line training history and training registry files relative to D2.
- Overlapping chat shell files were hand-merged so C0 adapter UI and B8 asset cache status both remain visible.

## Files intentionally excluded

- `artifacts/` payloads.
- Model checkpoints and model weights.
- Tokenizer artifacts.
- Exported or quantized shards.
- Raw, clean, or processed corpus payloads.
- Root DOCX/PDF files.
- `data/public_ingestion`.
- `training/current`.
- A-line training scripts, tests, approvals, and registries introduced by older branches.

## Package scripts

R27D3 keeps:

- `build`: `npm run build:vercel`
- `build:vercel`: `node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build`

R27D3 adds or retains:

- `test:r27c0`
- `test:r27b8`
- `test:r27e0`
- `test:r27d2`
- `test:r27d3`
- `check:r27d3-unified-static-delivery`

No build script invokes training.
