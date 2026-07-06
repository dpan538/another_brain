#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a8b_controller import REPORTS, write_json
from src.training.campaign.r27a8b_resource_guard import preflight_resource_guard


def main():
    report = preflight_resource_guard()
    write_json(REPORTS / "resource_guard_preflight.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if not report.get("ok"):
        raise SystemExit("r27a8b_resource_guard_blocked")


if __name__ == "__main__":
    main()
