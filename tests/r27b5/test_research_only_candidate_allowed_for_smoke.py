import unittest

from src.browser_export.full_bundle_budget import FullBundleBudgetInput, classify_budget


class R27B5ResearchOnlySmokeTests(unittest.TestCase):
    def test_research_only_budget_risk_can_still_be_engineering_smoke(self):
        report = classify_budget(
            FullBundleBudgetInput(
                current_build_output_bytes=22_000_000,
                candidate_model_q4_bytes=95_000_000,
                tokenizer_bytes=2_000_000,
            )
        )
        self.assertEqual(report["classification"], "research_only_budget_risk")
        self.assertIn("candidate_does_not_fit_full_100mb_static_bundle", report["blockers"])
        self.assertEqual(report["candidate_route"], "research_only")


if __name__ == "__main__":
    unittest.main()
