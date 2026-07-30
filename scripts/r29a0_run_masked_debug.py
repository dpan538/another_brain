#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.training.campaign.r29a0_masked_debug import CAMPAIGN_ID, run_masked_debug


if __name__ == "__main__":
    print(run_masked_debug(CAMPAIGN_ID, prefer_device="mps", resource_safe=True))
