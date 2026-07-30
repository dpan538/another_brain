import unittest

from src.training.model_lab.limited_scale_smoke import budget_for_params, select_for_a8b


class LimitedScaleSmokeTests(unittest.TestCase):
    def test_budget_marks_large_estimates_out_of_static_budget(self):
        self.assertFalse(budget_for_params(500_000_000)["fits_100mb_q4"])
        self.assertFalse(budget_for_params(2_000_000_000)["fits_100mb_q4"])

    def test_cpu_selection_avoids_100m_plus(self):
        results = [
            {"candidate": "new_30m", "ok": True, "params": 30_000_000, "budget": {"fits_100mb_q4": True}},
            {"candidate": "new_100m", "ok": True, "params": 100_000_000, "budget": {"fits_100mb_q4": True}},
        ]
        self.assertEqual(select_for_a8b(results, "cpu")["candidate"], "new_30m")


if __name__ == "__main__":
    unittest.main()
