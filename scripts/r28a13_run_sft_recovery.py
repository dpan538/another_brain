#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r28a13_controller import CAMPAIGN_ID, run_sft_recovery


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default=CAMPAIGN_ID)
    parser.add_argument("--resume-from-a12-best", action="store_true")
    parser.add_argument("--prefer-device", default="mps")
    parser.add_argument("--resource-safe", action="store_true")
    args = parser.parse_args()
    print(
        run_sft_recovery(
            args.campaign_id,
            resume_from_a12_best=args.resume_from_a12_best,
            prefer_device=args.prefer_device,
            resource_safe=args.resource_safe,
        )
    )
