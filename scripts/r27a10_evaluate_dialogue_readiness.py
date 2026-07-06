#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a10_budget_aware_controller import evaluate_dialogue_readiness


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a10_budget_aware_candidate_repair_v1")
    parser.add_argument("--checkpoint", default="best_product_probe")
    args = parser.parse_args()
    print(evaluate_dialogue_readiness(args.campaign_id, args.checkpoint))
