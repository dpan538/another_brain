#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r28a13_controller import CAMPAIGN_ID, write_handoff_if_improved


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign-id", default=CAMPAIGN_ID)
    args = parser.parse_args()
    print(write_handoff_if_improved(args.campaign_id))
