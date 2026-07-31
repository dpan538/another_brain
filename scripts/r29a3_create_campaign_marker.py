#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.training.campaign.r29a3_cross_concept_generalization import CAMPAIGN_ID, create_campaign_marker
print(create_campaign_marker(CAMPAIGN_ID))
