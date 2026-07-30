import json
import tempfile
import unittest
from pathlib import Path

from src.training.eval.full_static_budget import audit_full_static_budget


def write_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data), encoding="utf-8")


class R27A10FullStaticBudgetTests(unittest.TestCase):
    def test_100m_q4_fails_full_budget_while_60m_fits(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_json(root / "artifacts/r27a10/reports/a8b_a9b_intake.json", {"inputs": {"b4_bundle_source": {"bytes": 22204089, "source": "test"}}})
            write_json(root / "artifacts/r27a8b/reports/100mb_budget.json", {"parameter_count": 106000384})
            report = audit_full_static_budget(root)
            self.assertFalse(report["a8b_100m_q4_fits_full_static_100mb"])
            self.assertEqual(report["a8b_100m_q4_product_path"], "impossible_under_100mb")
            self.assertTrue(report["sixty_m_q4_fits_full_static_100mb"])
