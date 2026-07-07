import unittest

from scripts.r28qa1_run_qa_matrix import qa_matrix


class R28QA1MatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = qa_matrix(run_readable_smoke=False)

    def test_matrix_passes_in_metadata_mode(self):
        self.assertTrue(self.report["ok"], self.report.get("failures"))
        self.assertEqual(self.report["fail_count"], 0)
        self.assertGreaterEqual(self.report["pass_count"], 24)

    def test_required_scenarios_are_present(self):
        names = {item["name"] for item in self.report["scenarios"]}
        for name in [
            "open chat route",
            "runtime mode shown",
            "adapter import plain text",
            "RAG demo evidence",
            "malicious evidence injection",
            "readable generation smoke",
            "release blockers visible",
        ]:
            self.assertIn(name, names)

    def test_readable_inference_status_is_rt2(self):
        readable = self.report["readable_inference_status"]
        self.assertTrue(readable["ok"], readable)
        self.assertEqual(readable["runtime_mode"], "static_q4_experimental")
        self.assertGreaterEqual(readable["generated_token_count"], 40)

    def test_budget_and_non_claims(self):
        self.assertLessEqual(self.report["budget"]["full_bundle_bytes"], 100_000_000)
        non_claims = self.report["non_claims"]
        self.assertFalse(non_claims["training"])
        self.assertFalse(non_claims["new_model_assets"])
        self.assertFalse(non_claims["backend_inference"])
        self.assertFalse(non_claims["external_llm_api"])
        self.assertFalse(non_claims["doubao"])

    def test_vercel_preview_remains_manual_pending(self):
        preview = self.report["vercel_preview_checklist"]
        self.assertEqual(preview["status"], "manual_pending")
        self.assertFalse(preview["vercel_preview_checked"])


if __name__ == "__main__":
    unittest.main()
