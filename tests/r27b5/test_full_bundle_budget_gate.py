import unittest

from src.browser_export.full_bundle_budget import FullBundleBudgetInput, classify_budget


class R27B5FullBundleBudgetGateTests(unittest.TestCase):
    def test_synthetic_candidate_is_not_product_path(self):
        report = classify_budget(FullBundleBudgetInput(current_build_output_bytes=22_000_000, synthetic=True))
        self.assertEqual(report["classification"], "synthetic_only")
        self.assertEqual(report["candidate_route"], "synthetic")
        self.assertFalse(report["product_path_candidate"])


if __name__ == "__main__":
    unittest.main()
