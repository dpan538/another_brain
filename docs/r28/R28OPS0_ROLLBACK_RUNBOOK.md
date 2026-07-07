# R28OPS0 Rollback Runbook

Use this runbook when a prelaunch preview or release candidate needs to be backed out. R28OPS0 does not train, does not delete model assets, does not connect backend/external LLM runtime, and does not perform product admission.

## Roll Back To Prior Main Commit

1. Identify the last known-good `main` commit:

```bash
git fetch origin
git log --oneline origin/main -10
```

2. If production already points at a bad merge, restore by creating a revert PR or by redeploying the prior Vercel deployment. Do not force-push `main` unless the maintainer explicitly chooses that emergency path.
3. Record the bad branch, bad SHA, known-good SHA, deployment URL, and first failure symptom.

## Revert PR

Preferred Git path:

```bash
git checkout -b revert-r28-prelaunch-<short-sha> origin/main
git revert <merge_commit_sha>
git push -u origin revert-r28-prelaunch-<short-sha>
```

Then open a PR with:

- bad deployment URL.
- first failing command or route.
- whether the failure was build, preview route, static asset, UI, or policy boundary.
- confirmation that revert does not add training/model assets.

## Vercel Redeploy Previous Deployment

Use Vercel dashboard rollback when the code revert is not yet merged:

1. Open the project deployments list.
2. Find the last known-good deployment before the bad branch/SHA.
3. Promote or redeploy the previous deployment according to project policy.
4. Record the deployment id, deployment URL, source branch, and SHA.
5. Confirm the preview/root/chat routes load after redeploy.

Do not infer the remote cause from local checks alone. If Vercel logs are unavailable, ask for the deployment details log and keep the report evidence-based.

## Disable Candidate Route By Runtime Mode

If the issue is candidate-route presentation rather than the static shell itself, disable the candidate route in `web/another_brain/runtime_mode.json` in a follow-up PR:

```json
{
  "delivery_mode": "demo_static",
  "model_mode": "synthetic_tiny",
  "rag_mode": "static_demo",
  "candidate_route": "synthetic_only",
  "candidate_static_bundle": false,
  "product_model": false,
  "product_admission": false,
  "browser_admission": false,
  "release_checkpoint": false,
  "backend_inference": false,
  "external_llm_api": false,
  "hosted_vector_store": false
}
```

Keep this as a controlled PR. Do not edit dashboard environment variables to secretly change runtime policy.

## Fallback To Synthetic/Demo Mode

If assets, cache, or candidate metadata are suspected:

- Keep `delivery_mode` as `demo_static`.
- Set route markers to synthetic/demo only.
- Keep `asset_cache_mode` as `memory_fallback` when browser cache is unavailable.
- Keep model/tokenizer declared bytes at zero.
- Re-run `python3 scripts/r28e1_acceptance_matrix.py --no-write-report`.

## Cache Invalidation

Use non-destructive invalidation first:

- Redeploy the last known-good Vercel deployment.
- Confirm JS cache headers remain `public, max-age=0, must-revalidate`.
- Bump static metadata only if a tracked config file actually changed.
- Ask testers to hard refresh the preview route.

Do not delete tracked manifests, runtime mode files, docs, or evidence reports to clear cache symptoms.

## What Not To Delete

Do not delete:

- Git history or remote branches without maintainer approval.
- `web/another_brain/runtime_mode.json`.
- `web/another_brain/asset_manifest.json`.
- `docs/r28/*` runbooks or acceptance reports.
- `data/training_registry/*` blocker records.
- Existing static fixtures that older gates allowlist.
- Any local ignored artifacts that belong to another active worktree or training run.

## Artifact Safety

Before pushing a rollback PR, run:

```bash
git diff --name-status origin/main...HEAD
git ls-files | rg '(^artifacts/|\.(pt|pth|safetensors|ckpt|onnx|gguf)$|(^|/)tokenizer\.(json|model)$|^data/public_ingestion/|^[^/]+\.(docx|pdf)$|\.(adapter|context|evidence|state)-packet\.json$)'
npm run check:r27b0-static-only
npm run check:no-training-in-routine-gates
npm run check:training-approval-markers
```

Known historical allowlist:

- `artifacts/.gitkeep`
- `static_llm/fixtures/tiny_decoder_fixture/tokenizer.json`

Rollback must not add new model assets, tokenizer artifacts, exported shards, root DOCX/PDF files, `data/public_ingestion`, or private adapter/context/evidence payload samples.
