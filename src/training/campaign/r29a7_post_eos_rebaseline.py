from pathlib import Path
from src.training.campaign.r27a10_intake import ROOT
from src.training.campaign import r29a6_single_wrapper_anchor as engine
CAMPAIGN_ID="r29a7_96m_post_eos_rebaseline_v1"; ART=ROOT/"artifacts/r29a7"; APPROVAL_KEY="R29A7_POST_EOS_REBASELINE_ALLOWED"
def _configure(): engine.CAMPAIGN_ID,engine.ART,engine.APPROVAL_KEY=CAMPAIGN_ID,ART,APPROVAL_KEY
def create_campaign_marker(): _configure(); return engine.create_campaign_marker(CAMPAIGN_ID)
def run(): _configure(); return engine.run_single_wrapper_anchor(CAMPAIGN_ID,prefer_device="mps",resource_safe=True)
