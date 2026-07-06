import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a10_route_decision import make_route_decision


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class R27A10RouteDecisionTests(unittest.TestCase):
    def test_loss_accounting_bug_blocks_even_if_60m_fits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {"a8b": {"dialogue_readiness": "not_ready", "optimizer_tokens_below_minimum": True}})
            write_json(root / "artifacts/r27a10/reports/loss_calibration_audit.json", {"loss_gap_status": "likely_accounting_bug", "block_training": True})
            write_json(
                root / "artifacts/r27a10/reports/full_static_budget_audit.json",
                {
                    "a8b_100m_q4_product_path": "impossible_under_100mb",
                    "a8b_100m_q4_fits_full_static_100mb": False,
                    "sixty_m_q4_fits_full_static_100mb": True,
                },
            )
            decision = make_route_decision(root)
            self.assertEqual(decision["decision"], "NO_TRAIN_WRITE_BLOCKER")
            self.assertFalse(decision["train_allowed_now"])
            self.assertIn("BLOCK_LOSS_ACCOUNTING", decision["blockers"])
