#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_budget_aware_controller import create_campaign_marker


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a10_budget_aware_candidate_repair_v1")
    args = parser.parse_args()
    print(create_campaign_marker(args.campaign_id))
