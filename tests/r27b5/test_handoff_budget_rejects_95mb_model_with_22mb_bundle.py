import unittest

from src.browser_export.full_bundle_budget import FullBundleBudgetInput, classify_budget


class R27B5Reject95MBTests(unittest.TestCase):
    def test_95mb_model_with_22mb_bundle_is_not_product_path(self):
        report = classify_budget(
            FullBundleBudgetInput(
                current_build_output_bytes=22_000_000,
                candidate_model_q4_bytes=95_000_000,
                tokenizer_bytes=0,
            )
        )
        self.assertEqual(report["classification"], "research_only_budget_risk")
        self.assertEqual(report["candidate_route"], "research_only")
        self.assertFalse(report["product_path_candidate"])
        self.assertGreater(report["total_projected_bytes"], 100_000_000)


if __name__ == "__main__":
    unittest.main()
