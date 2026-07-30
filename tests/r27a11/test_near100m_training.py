import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r27a11_near100m_controller as controller


class R27A11Near100MTrainingTests(unittest.TestCase):
    def test_training_blocks_when_loss_accounting_not_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.ART, controller.REPORTS, controller.MARKER, controller.LEDGER, controller.REGISTRY_LEDGER, controller.REGISTRY_POLICY)
            try:
                controller.ROOT = root
                controller.ART = root / "artifacts/r27a11"
                controller.REPORTS = controller.ART / "reports"
                controller.MARKER = controller.REPORTS / "campaign_marker.json"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                controller.REGISTRY_LEDGER = root / "data/training_registry/r27a11_campaign_ledger.json"
                controller.REGISTRY_POLICY = root / "data/training_registry/r27a11_campaign_policy.json"
                controller.REPORTS.mkdir(parents=True)
                controller.MARKER.write_text(json.dumps({"campaign_id": "r27a11_near100m_budgetfit_candidate_v1", "active": True}), encoding="utf-8")
                ledger = controller.run_near100m_training("r27a11_near100m_budgetfit_candidate_v1")
                self.assertFalse(ledger["train_started"])
                self.assertIn("BLOCK_LOSS_ACCOUNTING_CONTINUES", ledger["blockers"])
            finally:
                controller.ROOT, controller.ART, controller.REPORTS, controller.MARKER, controller.LEDGER, controller.REGISTRY_LEDGER, controller.REGISTRY_POLICY = old


if __name__ == "__main__":
    unittest.main()
