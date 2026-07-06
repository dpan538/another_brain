#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a8b_controller import run_overnight


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a8b_resource_safe_overnight_v1")
    ap.add_argument("--launch-config", default="artifacts/r27a7r2/go/R27A8B_READY.json")
    ap.add_argument("--resource-safe", action="store_true")
    ap.add_argument("--slow-ramp", action="store_true")
    ap.add_argument("--run-label", default="r27a8b_resource_safe_overnight_v1")
    args = ap.parse_args()
    report = run_overnight(args.campaign_id, launch_config=args.launch_config, run_label=args.run_label, resume=False)
    print(json.dumps({k: report.get(k) for k in ["ok", "campaign_id", "optimizer_tokens", "segment_count", "stop_reason", "wall_clock_seconds", "blockers"]}, ensure_ascii=False, indent=2, sort_keys=True))
    if not report.get("ok"):
        raise SystemExit("r27a8b_overnight_not_ok")


if __name__ == "__main__":
    main()
