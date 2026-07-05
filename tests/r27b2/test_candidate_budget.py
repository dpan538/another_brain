import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B2CandidateBudgetTests(unittest.TestCase):
    def test_candidate_budget_report_passes_for_synthetic_fallback(self):
        result = subprocess.run(
            ["python3", "scripts/r27b2_candidate_budget.py", "--synthetic-if-missing"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"])
        self.assertTrue(report["under_100mb"])
        for label in ("60M", "100M", "125M", "150M", "0.5B_estimate_only", "2B_estimate_only"):
            self.assertIn(label, report["comparisons"])


if __name__ == "__main__":
    unittest.main()
