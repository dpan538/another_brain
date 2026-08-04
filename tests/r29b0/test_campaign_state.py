import json, subprocess, sys, tempfile, unittest
from pathlib import Path
class CampaignState(unittest.TestCase):
 def test_block_state_is_atomic_and_terminal(self):
  with tempfile.TemporaryDirectory() as tmp:
   subprocess.run([sys.executable,"scripts/r29b0_run_campaign.py","--artifact-root",tmp,"--state","BLOCKED_WITH_EVIDENCE","--evidence","fixture"],check=True,capture_output=True,text=True)
   state=json.loads((Path(tmp)/"campaign_state.json").read_text()); self.assertEqual(state["state"],"BLOCKED_WITH_EVIDENCE"); self.assertTrue(state["terminal"])
