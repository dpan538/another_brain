from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.training.campaign.r29a7_post_eos_rebaseline import create_campaign_marker, run

print(create_campaign_marker())
print(run())
