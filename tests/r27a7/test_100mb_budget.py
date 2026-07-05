import unittest

from src.training.eval.r27a7_budget import browser_budget_report


class R27A7BudgetTests(unittest.TestCase):
    def test_large_models_do_not_fit_current_budget(self):
        report = browser_budget_report(60_000_000)
        self.assertFalse(report["0_5b_fits_current_static_budget"])
        self.assertFalse(report["2b_fits_current_static_budget"])

    def test_report_has_recommendation(self):
        self.assertIn("recommendation", browser_budget_report(8_000_000))


if __name__ == "__main__":
    unittest.main()
