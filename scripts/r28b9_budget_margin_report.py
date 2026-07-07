#!/usr/bin/env python3
"""R28B9 100MB margin report for the A12 96M candidate."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.r28b9_bundle_size_breakdown import BASE_REF, build_breakdown, write_json

A12_FULL_STATIC_ESTIMATE_BYTES = 98_385_593
MAX_STATIC_BYTES = 100_000_000
REPORT_PATH = ROOT / "artifacts" / "r28b9" / "reports" / "budget_margin_report.json"


def build_margin_report() -> dict:
    breakdown = build_breakdown(BASE_REF)
    before_bundle = int(breakdown["before"]["bundle_bytes"])
    after_bundle = int(breakdown["after"]["bundle_bytes"])
    bytes_saved = int(breakdown["bytes_saved"])
    new_full_estimate = A12_FULL_STATIC_ESTIMATE_BYTES - bytes_saved
    new_margin = MAX_STATIC_BYTES - new_full_estimate
    return {
        "ok": bytes_saved >= 0,
        "base_ref": BASE_REF,
        "before_bundle_bytes": before_bundle,
        "after_bundle_bytes": after_bundle,
        "bytes_saved": bytes_saved,
        "a12_original_full_static_estimate_bytes": A12_FULL_STATIC_ESTIMATE_BYTES,
        "new_full_estimate_for_96m_bytes": new_full_estimate,
        "new_100mb_margin_bytes": new_margin,
        "margin_gt_3mb": new_margin > 3_000_000,
        "margin_gt_5mb": new_margin > 5_000_000,
        "static_bundle_margin_bytes": MAX_STATIC_BYTES - after_bundle,
        "release_candidate_mode": "demo_static_with_engineering_candidate_metadata",
        "non_claims": {
            "training": False,
            "model_assets": False,
            "product_model": False,
            "browser_admission": False,
            "release_checkpoint": False,
        },
        "largest_removed_or_ignored": breakdown["largest_removed_or_ignored"],
        "saved_by_category": breakdown["saved_by_category"],
    }


def main() -> int:
    report = build_margin_report()
    write_json(REPORT_PATH, report)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
