# R27A11 Loss Accounting Fix

R27A11 fixes the R27A10 `BLOCK_LOSS_ACCOUNTING` condition by replacing last-batch headline train loss with token-weighted negative log likelihood reports.

## Corrected Method

- `running_train_loss`: token-weighted running average over optimizer batches.
- `eval_train_loss`: token-weighted evaluation loss over a train evaluation window.
- `dev_loss`: token-weighted evaluation loss over the dev split.
- `stratified_heldout_loss`: token-weighted evaluation loss over the heldout split.
- `last_batch_loss`: debug only, never the headline metric.
- `optimizer_tokens`: actual optimizer steps times effective tokens per step.

The current R27A11 streams are text streams, so they use `full_next_token` masking consistently across train/dev/heldout. Assistant-only SFT masking is implemented for rows where prompt/response token boundaries are available, but R27A11 does not fabricate such boundaries.

R27A11 does not claim product training, formal decoder training, phase_4, product admission, browser admission, or a release checkpoint.
