# R28D4 Prelaunch PR And Preview Gate

R28D4 prepares the final prelaunch PR and preview-validation handoff. It does
not train, does not commit model assets, does not commit tokenizer artifacts,
does not connect backend inference, and does not merge main automatically.

## Branch Selection

Candidate inputs, in priority order:

1. `origin/r28m0-model-asset-dryrun`
2. `origin/r28p1-release-candidate-gate`
3. `origin/r28b9-static-bundle-diet`
4. `origin/r28p0b-prelaunch-integration`

The selected PR base input is `origin/r28m0-model-asset-dryrun` when available,
because it includes the B9 bundle diet and the M0 model-asset dry-run admission
decision. `origin/r28p1-release-candidate-gate` is useful release-candidate gate
evidence, but D4 does not automatically merge sibling branches.

## Local Gates

The D4 gate runs:

```bash
npm run test:r28m0
npm run test:r28b9
npm run test:r28p0b
npm run check:r27b0-static-budget
npm run check:r27b0-static-only
npm run build:vercel
```

If the Vercel CLI is installed, the gate also runs:

```bash
vercel build
```

If the GitHub CLI is installed, use it after the branch is pushed:

```bash
gh pr create --base main --head r28d4-prelaunch-pr-preview-gate --title "R28D4 prelaunch PR preview gate" --body-file artifacts/r28d4/reports/pr_body.md
```

In this local run, `gh` and `vercel` were not available, so PR creation and
`vercel build` are manual follow-ups.

## Local Gate Result

Inputs discovered:

- R28M0: `origin/r28m0-model-asset-dryrun` at `8bd756b`
- R28P1: `origin/r28p1-release-candidate-gate` at `25fbbb0`
- R28B9: `origin/r28b9-static-bundle-diet` at `c8f4c88`
- R28P0B: `origin/r28p0b-prelaunch-integration` at `14c0653`

Selected input: `origin/r28m0-model-asset-dryrun`.

Lineage notes:

- M0 contains B9: `true`
- M0 contains P0B: `true`
- M0 contains P1: `false`
- P1 is treated as sibling release-candidate evidence and is not merged
  automatically by D4.

Local gate status:

- `npm run test:r28m0`: passed
- `npm run test:r28b9`: passed
- `npm run test:r28p0b`: passed
- `npm run check:r27b0-static-budget`: passed
- `npm run check:r27b0-static-only`: passed
- `npm run build:vercel`: passed
- `gh` CLI: unavailable
- `vercel` CLI: unavailable, so `vercel build` was not run locally

## Artifact Safety

The gate checks that the D4 diff does not add:

- `artifacts/` payloads.
- `*.pt`, `*.pth`, `*.safetensors`, `*.ckpt`, `*.onnx`, or `*.gguf`.
- `tokenizer.json` or `tokenizer.model`.
- `data/public_ingestion`.
- Root DOCX/PDF files.

Existing ignored dry-run outputs under `artifacts/r28m0/` or `artifacts/r28d4/`
remain local-only and are not committed.

## PR Instructions

Manual PR URL:

`https://github.com/dpan538/another_brain/pull/new/r28d4-prelaunch-pr-preview-gate`

PR title:

`R28D4 prelaunch PR preview gate`

Before merging:

- Confirm GitHub checks pass on the PR.
- Confirm a Vercel preview deployment is created and passes.
- Confirm the preview remains static-only.
- Confirm no model assets, tokenizer artifacts, exported shards, ONNX/GGUF, or
  generated artifacts are included.
- Do not treat this as product model admission, browser admission, release
  checkpoint admission, or phase approval.
