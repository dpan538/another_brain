import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r27a11_near100m_controller as controller


class R27A11EvaluationHandoffTests(unittest.TestCase):
    def test_handoff_no_go_when_training_did_not_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.REGISTRY_HANDOFF)
            try:
                controller.ROOT = root
                controller.REPORTS = root / "artifacts/r27a11/reports"
                controller.HANDOFF_DIR = root / "artifacts/r27a11/handoff"
                controller.REGISTRY_HANDOFF = root / "data/training_registry/r27a11_browser_handoff_summary.json"
                controller.REPORTS.mkdir(parents=True)
                controller.HANDOFF_DIR.mkdir(parents=True)
                (controller.REPORTS / "loss_accounting_validation.json").write_text(json.dumps({"loss_accounting_fixed": True}), encoding="utf-8")
                (controller.REPORTS / "campaign_evaluation.json").write_text(json.dumps({"training_ran": False, "blockers": ["disk_space_critical"]}), encoding="utf-8")
                (controller.REPORTS / "dialogue_readiness.json").write_text(json.dumps({"dialogue_readiness": "not_ready"}), encoding="utf-8")
                (controller.REPORTS / "budget_report.json").write_text(json.dumps({"full_static_100mb_fit": True, "selected_model": "new_96m"}), encoding="utf-8")
                handoff = controller.write_handoff("r27a11_near100m_budgetfit_candidate_v1")
                self.assertEqual(handoff["candidate_route"], "no_go_not_ready")
                self.assertFalse(handoff["ok"])
            finally:
                controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.REGISTRY_HANDOFF = old


if __name__ == "__main__":
    unittest.main()
