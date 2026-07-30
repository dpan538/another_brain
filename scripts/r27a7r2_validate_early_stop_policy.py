#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.early_stop_policy_v3 import POLICY_V3, should_stop_v3


def main():
    metric_before_min = should_stop_v3("dev_loss_no_improvement", 587, 5_324_800, 3)
    hard_before_min = should_stop_v3("active_marker_invalid", 10, 0, 1)
    metric_after_min = should_stop_v3("dev_loss_no_improvement", 4 * 3600, 15_000_000, 4)
    report = {
        "ok": metric_before_min[0] is False and hard_before_min[0] is True and metric_after_min[0] is True,
        "policy": POLICY_V3,
        "metric_stop_before_minimum": {"input": "dev_loss_no_improvement", "result": metric_before_min},
        "hard_stop_before_minimum": {"input": "active_marker_invalid", "result": hard_before_min},
        "metric_stop_after_minimum": {"input": "dev_loss_no_improvement", "result": metric_after_min},
        "stage_aware_metrics_required": True,
    }
    out = ROOT / "artifacts/r27a7r2/reports/early_stop_policy_v3.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (ROOT / "docs/r27/R27A7R2_EARLY_STOP_POLICY_V3.md").write_text(
        "# R27A7R2 Early Stop Policy V3\n\n"
        f"- Minimum wall-clock before metric stop hours: `{POLICY_V3['minimum_wall_clock_before_metric_stop_hours']}`\n"
        f"- Minimum optimizer tokens before metric stop: `{POLICY_V3['minimum_optimizer_tokens_before_metric_stop']}`\n"
        f"- Minimum segments before metric stop: `{POLICY_V3['minimum_segments_before_metric_stop']}`\n"
        f"- Metric stop before minimum: `{metric_before_min}`\n"
        f"- Hard stop before minimum: `{hard_before_min}`\n"
        f"- Metric stop after minimum: `{metric_after_min}`\n\n"
        "Segment 1/2/3 short-term dev-loss movement can no longer stop a 12h/24h style campaign before the minimum budget. Stage-aware metrics are required because curriculum stages are not directly comparable.\n",
        encoding="utf-8",
    )
    if not report["ok"]:
        raise SystemExit(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
