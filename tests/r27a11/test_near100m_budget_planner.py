import json
import tempfile
import unittest
from pathlib import Path

from src.training.eval.near100m_budget_planner import plan_near100m_budget


class R27A11Near100MBudgetPlannerTests(unittest.TestCase):
    def test_selects_96m_as_largest_q4_full_budget_fit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "artifacts/r27a10/reports").mkdir(parents=True)
            (root / "artifacts/r27a10/reports/a8b_a9b_intake.json").write_text(
                json.dumps({"inputs": {"b4_bundle_source": {"bytes": 22_204_089, "source": "test"}}}),
                encoding="utf-8",
            )
            report = plan_near100m_budget(root)
            self.assertEqual(report["selected_product_path_model"], "new_96m")
            by_label = {row["label"]: row for row in report["candidates"]}
            self.assertTrue(by_label["new_96m"]["fits_full_static_100mb"])
            self.assertFalse(by_label["new_100m_research"]["fits_full_static_100mb"])
            self.assertEqual(by_label["100m_q3_research_estimate"]["classification"], "research_only_budget_risk")


if __name__ == "__main__":
    unittest.main()
