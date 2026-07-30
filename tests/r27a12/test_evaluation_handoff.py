import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r27a12_controller as controller


class R27A12EvaluationHandoffTests(unittest.TestCase):
    def test_product_path_not_ready_when_training_safe_but_not_ready(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.REGISTRY_HANDOFF)
            try:
                controller.ROOT = root
                controller.REPORTS = root / "artifacts/r27a12/reports"
                controller.HANDOFF_DIR = root / "artifacts/r27a12/handoff"
                controller.REGISTRY_HANDOFF = root / "data/training_registry/r27a12_browser_handoff_summary.json"
                controller.REPORTS.mkdir(parents=True)
                controller.HANDOFF_DIR.mkdir(parents=True)
                (controller.REPORTS / "campaign_evaluation.json").write_text(json.dumps({"training_ran": True, "blockers": [], "optimizer_tokens": 10}), encoding="utf-8")
                (controller.REPORTS / "dialogue_readiness.json").write_text(json.dumps({"dialogue_readiness": "not_ready", "safety_guard": "clean"}), encoding="utf-8")
                (controller.REPORTS / "full_budget_report.json").write_text(json.dumps({"full_static_100mb_fit": True, "selected_model": "new_96m"}), encoding="utf-8")
                handoff = controller.write_handoff("r27a12_budgetfit_product_path_training_v1")
            finally:
                controller.ROOT, controller.REPORTS, controller.HANDOFF_DIR, controller.REGISTRY_HANDOFF = old
        self.assertEqual(handoff["candidate_route"], "product_path_not_ready")
        self.assertTrue(handoff["ok"])


if __name__ == "__main__":
    unittest.main()
