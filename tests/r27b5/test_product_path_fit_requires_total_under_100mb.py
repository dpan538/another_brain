import unittest

from src.browser_export.full_bundle_budget import FullBundleBudgetInput, classify_budget


class R27B5ProductPathFitTests(unittest.TestCase):
    def test_product_path_fit_requires_total_under_100mb_with_margin(self):
        report = classify_budget(
            FullBundleBudgetInput(
                current_build_output_bytes=22_000_000,
                candidate_model_q4_bytes=50_000_000,
                tokenizer_bytes=2_000_000,
                shard_overhead_bytes=1_000_000,
                manifest_overhead_bytes=100_000,
            )
        )
        self.assertEqual(report["classification"], "product_path_fit")
        self.assertEqual(report["candidate_route"], "product_path")
        self.assertTrue(report["product_path_candidate"])
        self.assertLessEqual(report["total_projected_bytes"], 100_000_000)


if __name__ == "__main__":
    unittest.main()
