#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a8b_controller import REPORTS, write_json
from src.training.campaign.r27a8b_launch_reader import read_launch_config


def main():
    report = read_launch_config()
    write_json(REPORTS / "launch_config_read.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if not report.get("ok"):
        write_json(REPORTS / "wait_or_block_report.json", {"ok": False, "status": report.get("status"), "blockers": report.get("blockers", []), "train_started": False})


if __name__ == "__main__":
    main()
