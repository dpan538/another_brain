from pathlib import Path
import json
import tempfile
import unittest

from src.training.reference.r29b1_campaign import CAMPAIGN_ID, TERMINAL_STATES, atomic_json, campaign_state


class SupervisorStateTests(unittest.TestCase):
    def test_terminal_state_is_explicit_and_training_is_disabled(self):
        state = campaign_state(state="BLOCKED_WITH_EVIDENCE", artifact_root=Path("artifacts/r29b1"))
        self.assertEqual(state["campaign_id"], CAMPAIGN_ID)
        self.assertTrue(state["terminal"])
        self.assertIn(state["state"], TERMINAL_STATES)
        self.assertFalse(state["training_started"])
        self.assertEqual(state["optimizer_tokens"], 0)

    def test_atomic_json_never_leaves_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            atomic_json(path, {"ok": True})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"ok": True})
            self.assertEqual(list(Path(directory).glob("*.tmp")), [])
