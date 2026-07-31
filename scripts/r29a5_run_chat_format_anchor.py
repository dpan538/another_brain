#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r29a5_chat_format_anchor import CAMPAIGN_ID, run_chat_format_anchor
print(run_chat_format_anchor(CAMPAIGN_ID, prefer_device="mps", resource_safe=True))
