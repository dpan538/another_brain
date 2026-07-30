#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a12_controller import write_handoff


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a12_budgetfit_product_path_training_v1")
    parser.add_argument("--checkpoint", default="best_product_probe")
    args = parser.parse_args()
    print(write_handoff(args.campaign_id, args.checkpoint))
