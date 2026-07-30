import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a10_budget_aware_controller import create_campaign_marker, run_budget_aware_training


class R27A10BudgetAwareTrainingTests(unittest.TestCase):
    def test_no_train_route_writes_blocked_ledger(self):
        import src.training.campaign.r27a10_budget_aware_controller as controller

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old_root, old_reports, old_marker, old_ledger, old_registry_policy, old_registry_ledger = (
                controller.ROOT,
                controller.REPORTS,
                controller.MARKER,
                controller.LEDGER,
                controller.REGISTRY_POLICY,
                controller.REGISTRY_LEDGER,
            )
            try:
                controller.ROOT = root
                controller.REPORTS = root / "artifacts/r27a10/reports"
                controller.MARKER = controller.REPORTS / "campaign_marker.json"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                controller.REGISTRY_POLICY = root / "data/training_registry/r27a10_campaign_policy.json"
                controller.REGISTRY_LEDGER = root / "data/training_registry/r27a10_campaign_ledger.json"
                controller.REPORTS.mkdir(parents=True)
                (controller.REPORTS / "route_decision.json").write_text(json.dumps({"decision": "NO_TRAIN_WRITE_BLOCKER", "train_allowed_now": False, "blockers": ["BLOCK_LOSS_ACCOUNTING"]}), encoding="utf-8")
                create_campaign_marker("r27a10_budget_aware_candidate_repair_v1")
                ledger = run_budget_aware_training("r27a10_budget_aware_candidate_repair_v1", controller.REPORTS / "route_decision.json")
                self.assertFalse(ledger["train_started"])
                self.assertIn("BLOCK_LOSS_ACCOUNTING", ledger["blockers"])
            finally:
                controller.ROOT, controller.REPORTS, controller.MARKER, controller.LEDGER, controller.REGISTRY_POLICY, controller.REGISTRY_LEDGER = (
                    old_root,
                    old_reports,
                    old_marker,
                    old_ledger,
                    old_registry_policy,
                    old_registry_ledger,
                )
