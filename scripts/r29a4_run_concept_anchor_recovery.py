#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r29a4_concept_anchor_recovery import CAMPAIGN_ID, run_concept_anchor_recovery
print(run_concept_anchor_recovery(CAMPAIGN_ID, prefer_device="mps", resource_safe=True))
