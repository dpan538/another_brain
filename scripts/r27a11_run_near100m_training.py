#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a11_near100m_controller import run_near100m_training


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a11_near100m_budgetfit_candidate_v1")
    parser.add_argument("--selected-model", default="auto_largest_budgetfit")
    parser.add_argument("--prefer-device", default="mps")
    parser.add_argument("--resource-safe", action="store_true")
    parser.add_argument("--run-label", default="r27a11_near100m_budgetfit_candidate_v1")
    args = parser.parse_args()
    print(run_near100m_training(args.campaign_id, args.selected_model, args.prefer_device, args.run_label))
