import unittest

from scripts.r28b9_budget_margin_report import A12_FULL_STATIC_ESTIMATE_BYTES, MAX_STATIC_BYTES
from scripts.r28b9_bundle_size_breakdown import (
    UNUSED_TEST_DEMO_ASSETS,
    classify_path,
    ignored_by_vercel,
    read_ignore_entries,
    summarize_files,
)


class R28B9BundleSizeBreakdownTests(unittest.TestCase):
    def test_required_category_classification(self):
        cases = {
            "web/app.js": "js_runtime",
            "web/another_brain_chat/app.js": "chat_shell",
            "web/another_brain/static_rag/demo_memory.json": "demo_rag_assets",
            "web/styles.css": "css",
            "web/app.js.map": "source_maps",
            "web/context_stress_cases.json": "unused_test_demo_assets",
            "web/model_inference_cases.json": "unused_test_demo_assets",
            "web/knowledge_shards/manifest.json": "manifest_overhead",
            "web/about.txt": "docs_static_copied_files",
        }
        for path, expected in cases.items():
            self.assertEqual(classify_path(path), expected)

    def test_vercel_ignore_entries_support_exact_prefix_glob_and_double_star(self):
        entries = read_ignore_entries(
            """
            # comment
            web/context_stress_cases.json
            web/*.map
            web/**/*.map
            artifacts/**
            """
        )
        self.assertTrue(ignored_by_vercel("web/context_stress_cases.json", entries))
        self.assertTrue(ignored_by_vercel("web/app.js.map", entries))
        self.assertTrue(ignored_by_vercel("web/another_brain_chat/app.js.map", entries))
        self.assertTrue(ignored_by_vercel("artifacts/r28b9/report.json", entries))
        self.assertFalse(ignored_by_vercel("web/app.js", entries))

    def test_summarize_files_counts_bytes_by_category(self):
        summary = summarize_files(
            {
                "web/app.js": 100,
                "web/another_brain_chat/app.js": 25,
                "web/model_inference_cases.json": 200,
            }
        )
        self.assertEqual(summary["js_runtime"]["bytes"], 100)
        self.assertEqual(summary["chat_shell"]["bytes"], 25)
        self.assertEqual(summary["unused_test_demo_assets"]["bytes"], 200)

    def test_unused_fixture_inventory_matches_b9_scope(self):
        self.assertIn("web/context_stress_cases.json", UNUSED_TEST_DEMO_ASSETS)
        self.assertIn("web/model_inference_cases.json", UNUSED_TEST_DEMO_ASSETS)
        self.assertNotIn("web/another_brain_chat/app.js", UNUSED_TEST_DEMO_ASSETS)

    def test_margin_math_can_cross_three_mb_after_savings(self):
        saved = 2_000_000
        new_estimate = A12_FULL_STATIC_ESTIMATE_BYTES - saved
        self.assertGreater(MAX_STATIC_BYTES - new_estimate, 3_000_000)
        self.assertLess(MAX_STATIC_BYTES - new_estimate, 5_000_000)


if __name__ == "__main__":
    unittest.main()
