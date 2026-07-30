#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_intake import NON_CLAIMS, now_utc, write_json, write_text


def main():
    report = {
        "ok": True,
        "created_at_utc": now_utc(),
        "fix_scope": [
            "Added token-weighted loss accumulation for train/dev/heldout.",
            "Separated running_train_loss, eval_train_loss, dev_loss, heldout_loss, and last_batch_loss.",
            "Demoted last_batch_loss to debug-only status.",
            "Made optimizer_tokens the primary train-token metric.",
        ],
        "mask_policy": {
            "pretraining_rows": "full_next_token",
            "sft_rows": "assistant_response_only_supported_when_prompt_response_boundaries_are_available",
            "r27a11_training_streams": "full_next_token_text_streams_use_same_policy_for_train_dev_heldout",
        },
        "training_allowed_by_this_script": False,
        **NON_CLAIMS,
    }
    write_json(ROOT / "artifacts/r27a11/reports/loss_accounting_fix.json", report)
    write_text(
        ROOT / "docs/r27/R27A11_LOSS_ACCOUNTING_FIX.md",
        """# R27A11 Loss Accounting Fix

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
""",
    )
    print(report)


if __name__ == "__main__":
    main()
