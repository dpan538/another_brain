#!/usr/bin/env python3
import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r27a11_near100m_controller import evaluate_campaign


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default="r27a11_near100m_budgetfit_candidate_v1")
    args = parser.parse_args()
    print(evaluate_campaign(args.campaign_id))
