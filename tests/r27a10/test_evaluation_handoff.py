import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a10_budget_aware_controller import evaluate_campaign, evaluate_dialogue_readiness, write_handoff


class R27A10EvaluationHandoffTests(unittest.TestCase):
    def test_no_go_handoff_is_not_admission(self):
        import src.training.campaign.r27a10_budget_aware_controller as controller

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.HANDOFF, controller.NO_GO, controller.LEDGER)
            try:
                controller.ROOT = root
                controller.REPORTS = root / "artifacts/r27a10/reports"
                controller.HANDOFF_DIR = root / "artifacts/r27a10/handoff"
                controller.HANDOFF = controller.HANDOFF_DIR / "R27_BROWSER_CANDIDATE_HANDOFF.json"
                controller.NO_GO = controller.HANDOFF_DIR / "NO_GO.json"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                controller.REPORTS.mkdir(parents=True)
                (controller.REPORTS / "route_decision.json").write_text(json.dumps({"decision": "NO_TRAIN_WRITE_BLOCKER", "candidate_route": "no_go_loss_accounting_blocker", "selected_model": "none", "train_allowed_now": False}), encoding="utf-8")
                (controller.REPORTS / "full_static_budget_audit.json").write_text(json.dumps({"a8b_100m_q4_product_path": "impossible_under_100mb", "sixty_m_q4_fits_full_static_100mb": True}), encoding="utf-8")
                (controller.REPORTS / "loss_calibration_audit.json").write_text(json.dumps({"loss_gap_status": "likely_accounting_bug", "block_training": True}), encoding="utf-8")
                evaluate_campaign("r27a10_budget_aware_candidate_repair_v1")
                evaluate_dialogue_readiness("r27a10_budget_aware_candidate_repair_v1")
                handoff = write_handoff("r27a10_budget_aware_candidate_repair_v1")
                self.assertFalse(handoff["ok"])
                self.assertFalse(handoff["browser_admission"])
                self.assertFalse(handoff["release_checkpoint"])
                self.assertTrue((root / "artifacts/r27a10/handoff/NO_GO.json").exists())
            finally:
                controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.HANDOFF, controller.NO_GO, controller.LEDGER = old
