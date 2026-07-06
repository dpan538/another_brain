#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_budget_aware_controller import run_budget_aware_training


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a10_budget_aware_candidate_repair_v1")
    parser.add_argument("--route-decision", default="artifacts/r27a10/reports/route_decision.json")
    parser.add_argument("--prefer-device", default="mps")
    parser.add_argument("--resource-safe", action="store_true")
    parser.add_argument("--run-label", default="r27a10_budget_aware_candidate_repair_v1")
    args = parser.parse_args()
    print(run_budget_aware_training(args.campaign_id, args.route_decision, args.prefer_device, args.run_label))
