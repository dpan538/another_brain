# R27A12 Finalizer Summary

R27A12F is a post-run finalizer for the existing R27A12 campaign. It does not start new long training and does not mutate model weights, tokenizer artifacts, static assets, or corpus text.

## Status

- Decision: `A12_ALREADY_FINALIZED`
- Campaign id: `r27a12_budgetfit_product_path_training_v1`
- A12 active: `false`
- A12 completed: `true`
- Marker consumed: `true`
- Active approvals: `0`
- Selected model: `new_96m`
- Selected device: `mps`
- Optimizer tokens: `10240000`
- Wall clock seconds: `35900.461`
- Best checkpoint: `artifacts/r27a12/model_lab/checkpoints/r27a12_budgetfit_product_path_training_v1_seg10_chinese_general.pt`
- Final checkpoint: `artifacts/r27a12/model_lab/checkpoints/r27a12_budgetfit_product_path_training_v1_seg10_chinese_general.pt`

## Evaluation Snapshot

- Eval train loss: `1.0426396375211577`
- Dev loss: `0.7341347895562649`
- Stratified heldout loss: `0.8993318205078443`
- Dialogue readiness: `candidate`
- RAG honesty: `basic_probe_clean`
- Collapse risk: `0.2`
- Safety guard: `clean`

## Finalizer Action

R27A12F confirmed that the campaign had already completed, the marker was already consumed, the best checkpoint artifact exists locally under ignored artifacts, and the browser handoff artifact exists. It did not rerun training, did not consume a new marker, and did not rewrite the handoff.

The ignored finalizer status report is written at `artifacts/r27a12/reports/a12_finalizer_status.json`.
