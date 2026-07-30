import unittest
import tempfile
from pathlib import Path

from src.training.campaign.r27a12_segment_scheduler import r27a12_schedule
from src.training.campaign import r27a12_controller as controller


class R27A12ProductPathTrainingTests(unittest.TestCase):
    def test_schedule_has_three_stage_rotation(self):
        rows = r27a12_schedule(4)
        self.assertEqual([row["stage_id"] for row in rows], ["chinese_general", "dialogue_rag", "consolidation", "chinese_general"])

    def test_blocked_without_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.REPORTS, controller.LEDGER, controller.REGISTRY_LEDGER)
            try:
                controller.ROOT = root
                controller.REPORTS = root / "artifacts/r27a12/reports"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                controller.REGISTRY_LEDGER = root / "data/training_registry/r27a12_campaign_ledger.json"
                ledger = controller._blocked_ledger("test_campaign", ["campaign_marker_missing_or_inactive"], "new_96m")
            finally:
                controller.ROOT, controller.REPORTS, controller.LEDGER, controller.REGISTRY_LEDGER = old
        self.assertFalse(ledger["training_ran"])
        self.assertEqual(ledger["optimizer_tokens"], 0)


if __name__ == "__main__":
    unittest.main()
