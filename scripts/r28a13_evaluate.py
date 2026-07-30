#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r28a13_controller import CAMPAIGN_ID, evaluate


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default=CAMPAIGN_ID)
    parser.add_argument("--compare-a12", action="store_true")
    parser.add_argument("--prefer-device", default="mps")
    args = parser.parse_args()
    print(evaluate(args.campaign_id, compare_a12=args.compare_a12, prefer_device=args.prefer_device))
