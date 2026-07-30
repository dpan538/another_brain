import unittest
from unittest import mock

from src.training.model_lab import r27a12_model_selection as selection


class R27A12ModelSelectionTests(unittest.TestCase):
    def test_selects_96m_when_budget_smoke_and_disk_pass(self):
        smoke = {
            "results": [
                {"candidate": "new_96m", "ok": True, "device": "mps"},
                {"candidate": "new_90m", "ok": True, "device": "mps"},
            ]
        }
        with mock.patch.object(selection, "_read_prior_a11_smoke", return_value=smoke), mock.patch.object(
            selection, "disk_free_report", return_value={"free_bytes": 60_000_000_000, "free_gb": 60}
        ):
            report = selection.select_budgetfit_model()
        self.assertTrue(report["ok"])
        self.assertEqual(report["selected_model"], "new_96m")


if __name__ == "__main__":
    unittest.main()
