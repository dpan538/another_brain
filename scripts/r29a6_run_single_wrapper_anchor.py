#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]; sys.path.insert(0,str(ROOT))
from src.training.campaign.r29a6_single_wrapper_anchor import CAMPAIGN_ID,run_single_wrapper_anchor
print(run_single_wrapper_anchor(CAMPAIGN_ID,prefer_device="mps",resource_safe=True))
