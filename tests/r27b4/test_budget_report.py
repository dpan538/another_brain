import unittest

from scripts.r27b4_bundle_report import make_bundle_report


class R27B4BudgetReportTests(unittest.TestCase):
    def test_bundle_report_passes_under_100mb(self):
        report = make_bundle_report()
        self.assertTrue(report["ok"], report["failures"])
        self.assertLess(report["build_output_bytes"], report["max_total_static_bytes"])
        self.assertGreater(report["margin_bytes"], 0)
        self.assertGreater(report["rag_asset_bytes"], 0)
        self.assertEqual(report["model_declared_bytes"], 0)
        self.assertEqual(report["tokenizer_declared_bytes"], 0)


if __name__ == "__main__":
    unittest.main()
