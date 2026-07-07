# R28M0 Model Asset Packaging Dry-Run

R28M0 is a pre-admission packaging dry-run for the R27A12 engineering candidate.
It does not train, download remote weights, commit weights, commit tokenizer
artifacts, connect backend inference, or claim a product model.

## Inputs

- A12 handoff: `artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
- A12 summary: `data/training_registry/r27a12_browser_handoff_summary.json`
- A12 finalizer, if present, for the selected checkpoint path.
- Current static shell bytes from the B9 bundle breakdown.

If handoff or checkpoint discovery fails, R28M0 writes a synthetic no-go report
and does not proceed to real export or quantization.

## Ignored Outputs

- `artifacts/r28m0/export/export_manifest.json`
- `artifacts/r28m0/quantized/a12_new_96m_q4.bin`
- `artifacts/r28m0/quantized/q4_manifest.json`
- `artifacts/r28m0/shards/a12_new_96m_q4_shard_*.bin`
- `artifacts/r28m0/manifests/same_origin_shards.json`
- `artifacts/r28m0/reports/*.json`

All generated model bytes remain ignored by `.gitignore`.

## Shard Rules

- Target shard size: 8MB to 16MB.
- Preferred maximum shard size: 25MB.
- Warning threshold: 50MiB.
- Hard maximum: 100MiB.
- Manifest paths must be same-origin relative paths.
- Every shard carries an exact byte count and SHA-256.

## Commands

```bash
npm run test:r28m0 || true
python3 scripts/r28m0_export_a12_candidate.py
python3 scripts/r28m0_quantize_q4.py
python3 scripts/r28m0_write_shards.py --target-shard-mb 12
python3 scripts/r28m0_loader_smoke.py
python3 scripts/r28m0_budget_report.py
npm run build:vercel
git diff --check
git diff --cached --check
git show --check HEAD
```

## Admission Labels

- `ready_for_explicit_asset_commit_approval`
- `over_budget`
- `loader_smoke_failed`
- `missing_handoff`
- `safety_blocker`
- `research_only`

`ready_for_explicit_asset_commit_approval` only means that R28M1 may request
explicit approval to commit static model assets. It is not product admission,
browser admission, or release checkpoint admission.

## Local Dry-Run Result

The local R28M0 run used the A12 handoff in the separate A12 worktree:

- Handoff: `/Users/jarlgiovanni/Desktop/another_brain_train_r27a12/artifacts/r27a12/handoff/R27_BROWSER_CANDIDATE_HANDOFF.json`
- Summary: `/Users/jarlgiovanni/Desktop/another_brain_train_r27a12/data/training_registry/r27a12_browser_handoff_summary.json`
- Finalizer: `/Users/jarlgiovanni/Desktop/another_brain_train_r27a12/artifacts/r27a12/reports/a12_finalizer_status.json`
- Source checkpoint: `/Users/jarlgiovanni/Desktop/another_brain_train_r27a12/artifacts/r27a12/model_lab/checkpoints/r27a12_budgetfit_product_path_training_v1_seg10_chinese_general.pt`

Result:

- Actual q4 bytes: `48,267,968`
- Shard count: `5`
- Max shard size: `12,000,000`
- Manifest bytes: `36,454`
- Current static bundle bytes: `19,613,136`
- Estimated tokenizer bytes: `4,000,000`
- Full bundle bytes: `71,917,558`
- 100MB margin: `28,082,442`
- Loader smoke: `passed`
- Admission decision: `ready_for_explicit_asset_commit_approval`
- R28M1 explicit asset commit approval recommended: `true`

Non-claims remain active: no training, no product model, no product admission,
no browser admission, no release checkpoint admission, no backend inference, and
no external LLM runtime.
