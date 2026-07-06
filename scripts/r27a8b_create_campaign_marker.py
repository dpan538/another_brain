#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a8b_controller import create_campaign_marker


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a8b_resource_safe_overnight_v1")
    ap.add_argument("--wall-clock-cap-hours", type=float, default=12)
    ap.add_argument("--minimum-wall-clock-before-metric-stop-hours", type=float, default=4)
    ap.add_argument("--minimum-optimizer-tokens-before-metric-stop", type=int, default=15_000_000)
    ap.add_argument("--max-optimizer-tokens", type=int, default=120_000_000)
    ap.add_argument("--max-segments", type=int, default=12)
    args = ap.parse_args()
    marker = create_campaign_marker(args.campaign_id, vars(args))
    print(json.dumps(marker, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
