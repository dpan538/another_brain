import unittest

from scripts.r27b1a_static_model_budget import BUDGET, make_budget_report


class R27B1A100MBBudgetTests(unittest.TestCase):
    def test_budget_contract(self):
        self.assertEqual(BUDGET["total_budget_bytes"], 100_000_000)
        self.assertEqual(BUDGET["model_weight_budget_bytes"], 70_000_000)
        self.assertEqual(BUDGET["tokenizer_budget_bytes"], 5_000_000)
        self.assertEqual(BUDGET["runtime_budget_bytes"], 15_000_000)
        self.assertEqual(BUDGET["rag_gate_budget_bytes"], 10_000_000)

    def test_budget_report_contains_requested_scales(self):
        report = make_budget_report([7_528_128, 30_000_000, 60_000_000, 100_000_000, 500_000_000, 2_000_000_000])
        labels = [row["label"] for row in report["rows"]]
        self.assertIn("30M q4 estimate", labels)
        self.assertIn("0.5B q4 estimate", labels)
        self.assertTrue(report["rows"][0]["q4_fits_model_weight_budget"])
        self.assertFalse(report["rows"][-1]["q4_fits_model_weight_budget"])


if __name__ == "__main__":
    unittest.main()
