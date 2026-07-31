from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src.training.campaign.r29a7_post_eos_rebaseline import abort_due_to_supervisor, create_campaign_marker, run

try:
    print(create_campaign_marker())
    print(run())
except KeyboardInterrupt:
    print(abort_due_to_supervisor("supervisor_interrupt"))
