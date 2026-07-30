# R27A10 Loss Calibration Audit

R27A10 found a loss-calibration blocker before starting any new training.

## Result

- Status: `likely_accounting_bug`
- Block training: `True`
- Reported train loss: `0.24599352478981018`
- Reported train loss source: `last_segment_train_loss_end`
- Final dev loss: `5.301941096782684`
- Final stratified heldout loss: `3.82134909927845`
- Final train/dev gap: `5.055947571992874`
- Train loss trusted: `False`
- Dev loss trusted: `True`
- Heldout loss trusted: `True`

## Diagnosis

The A8B headline train loss is not an eval-equivalent aggregate. It matches the last segment `train_loss_end`, while dev and heldout are windowed evaluation losses. That makes the apparent 0.2459 vs 5.3019 gap a metric-accounting problem until a comparable train eval window is reported.

## Required Fix

- Add separate `train_loss_last_observed`, `train_loss_window_mean`, and `train_loss_eval_window` fields.
- Keep stage-aware metrics for Chinese/general, SFT/dialogue, RAG/value, and consolidation stages.
- Re-run training only after this blocker is cleared by a later approved repair.

R27A10 does not train, does not mutate corpus files, does not approve phase_4, and does not claim product/browser admission.
