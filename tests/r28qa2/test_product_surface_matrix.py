import unittest

from scripts.r28qa2_product_surface_matrix import product_surface_matrix


class R28QA2ProductSurfaceMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = product_surface_matrix(run_real_smoke=False)

    def test_matrix_has_no_hard_failures(self):
        self.assertTrue(self.report["ok"], self.report.get("failures"))
        self.assertEqual(self.report["fail_count"], 0)
        self.assertGreaterEqual(self.report["pass_count"], 13)

    def test_expected_output_label(self):
        labels = set(self.report["labels"])
        self.assertEqual(self.report["output_label"], "preview_ready_with_quality_blocker")
        self.assertIn("preview_ready_with_quality_blocker", labels)
        self.assertNotIn("blocked_tokenizer", labels)
        self.assertNotIn("blocked_runtime", labels)
        self.assertNotIn("blocked_budget", labels)

    def test_required_surface_scenarios_present(self):
        names = {item["name"] for item in self.report["scenarios"]}
        for name in [
            "readable q4 generation",
            "Chinese-first prompts",
            "RAG sufficient",
            "RAG insufficient",
            "RAG conflict",
            "malicious evidence",
            "adapter local context",
            "fallback quality",
            "no product claim",
            "exact tokenizer status",
            "mobile/accessibility",
            "Vercel build config",
            "bundle under 100MB",
        ]:
            self.assertIn(name, names)

    def test_runtime_quality_summary(self):
        summary = self.report["quality_summary"]
        self.assertEqual(summary["tokenizer_decode_status"], "exact_runtime_tokenizer")
        self.assertTrue(summary["exact_decode"])
        self.assertGreaterEqual(summary["generated_token_count"], 40)
        self.assertEqual(summary["runtime_quality_status"], "quality_not_ready")
        self.assertTrue(summary["quality_blocker"])

    def test_non_claims_remain_false(self):
        non_claims = self.report["non_claims"]
        self.assertFalse(non_claims["training"])
        self.assertFalse(non_claims["new_model_assets"])
        self.assertFalse(non_claims["backend_inference"])
        self.assertFalse(non_claims["external_llm_api"])
        self.assertFalse(non_claims["doubao"])
        self.assertFalse(non_claims["product_admission"])


if __name__ == "__main__":
    unittest.main()
