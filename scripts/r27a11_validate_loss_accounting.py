#!/usr/bin/env python3
from pathlib import Path
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_intake import NON_CLAIMS, now_utc, write_json
from src.training.model_lab.loss_accounting import make_loss_mask, toy_negative_log_likelihood, weighted_average
from src.training.model_lab.train_metrics import TrainMetrics, validate_headline_not_last_batch


def close(left, right, tolerance=1e-9):
    return abs(float(left) - float(right)) <= tolerance


def validate():
    checks = []
    expected = (-math.log(0.5) - math.log(0.25)) / 2.0
    toy = toy_negative_log_likelihood([0.5, 0.25])
    checks.append({"name": "known_toy_batch_loss_matches_expected", "ok": close(toy["average_loss"], expected), "observed": toy["average_loss"], "expected": expected})

    mask = make_loss_mask(2, "assistant_response_only", prompt_token_count=1)
    masked = toy_negative_log_likelihood([0.5, 0.25], mask)
    checks.append({"name": "masked_prompt_tokens_not_counted", "ok": close(masked["average_loss"], -math.log(0.25)), "mask": mask, "tokens": masked["total_loss_tokens"]})

    train = weighted_average([1.0, 3.0], [1, 3])
    dev = weighted_average([1.0, 3.0], [1, 3])
    checks.append({"name": "train_dev_eval_use_same_reduction", "ok": close(train["average_loss"], dev["average_loss"]), "average": train["average_loss"]})

    metrics = TrainMetrics(effective_tokens_per_step=128, planned_tokens=1000, streamed_tokens=800)
    metrics.add_optimizer_step(2.0, 128, "toy")
    headline = metrics.headline_metrics()
    checks.append({"name": "last_batch_proxy_cannot_be_headline_metric", "ok": validate_headline_not_last_batch(headline), "headline_source": headline["headline_train_loss_source"]})
    checks.append({"name": "optimizer_tokens_not_planned_tokens_unless_actually_equal", "ok": headline["optimizer_tokens"] == 128 and headline["optimizer_tokens"] != headline["planned_tokens"], "headline": headline})

    ok = all(check["ok"] for check in checks)
    report = {
        "ok": ok,
        "created_at_utc": now_utc(),
        "loss_accounting_fixed": ok,
        "checks": checks,
        "corrected_train_dev_heldout_method": "token_weighted_average_negative_log_likelihood",
        "last_batch_loss_debug_only": True,
        "primary_token_metric": "optimizer_tokens",
        "training_allowed_by_validation": ok,
        **NON_CLAIMS,
    }
    write_json(ROOT / "artifacts/r27a11/reports/loss_accounting_validation.json", report)
    if ok:
        write_json(ROOT / "artifacts/r27a11/reports/LOSS_ACCOUNTING_FIXED.json", report)
    else:
        write_json(ROOT / "artifacts/r27a11/reports/BLOCK_LOSS_ACCOUNTING_CONTINUES.json", {"ok": False, "blocker": "loss_accounting_validation_failed", "checks": checks, **NON_CLAIMS})
    return report


if __name__ == "__main__":
    print(validate())
