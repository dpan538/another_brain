#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a8b_evaluation import budget_report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--campaign-id", default="r27a8b_resource_safe_overnight_v1")
    ap.add_argument("--checkpoint", default="best_product_probe")
    args = ap.parse_args()
    report = budget_report(args.campaign_id, args.checkpoint)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
