#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r29a3_cross_concept_generalization import CAMPAIGN_ID, run_cross_concept_generalization
print(run_cross_concept_generalization(CAMPAIGN_ID, prefer_device="mps", resource_safe=True))
