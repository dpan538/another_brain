import unittest

from src.browser_export.r28m1_asset_commit import ASSET_ROOT, full_bundle_budget_gate


class R28M1FullBundleBudgetGateTests(unittest.TestCase):
    def test_full_bundle_budget_gate_passes_after_assets_generated(self):
        if not (ASSET_ROOT / "quantization.manifest.json").exists():
            self.skipTest("R28M1 static assets not generated yet")
        report = full_bundle_budget_gate()
        self.assertTrue(report["ok"], report.get("failures"))
        self.assertLessEqual(report["full_bundle_bytes"], 100_000_000)
        self.assertGreaterEqual(report["margin_bytes"], 0)
        self.assertGreater(report["total_model_asset_bytes"], 0)
        self.assertLessEqual(report["max_file_bytes"], 25_000_000)


if __name__ == "__main__":
    unittest.main()
