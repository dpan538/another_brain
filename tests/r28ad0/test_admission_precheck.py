import unittest

from scripts.r28ad0_admission_precheck import admission_precheck


class R28AD0AdmissionPrecheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = admission_precheck(run_qa_readable_smoke=False)

    def test_precheck_does_not_approve_any_admission(self):
        self.assertFalse(self.report["admission_approved"])
        self.assertFalse(self.report["product_admission"])
        self.assertFalse(self.report["browser_admission"])
        self.assertFalse(self.report["release_checkpoint_admission"])

    def test_static_q4_prerequisites_are_present(self):
        checks = {item["name"]: item for item in self.report["checks"]}
        for name in [
            "model assets committed",
            "real q4 forward",
            "readable decode",
            "QA matrix",
            "bundle <100MB",
            "no backend/external runtime",
            "RAG honesty",
            "safety guard",
        ]:
            self.assertTrue(checks[name]["ok"], name)

    def test_preview_and_quality_block_admission_request(self):
        self.assertIn("not_ready_quality_blocked", self.report["labels"])
        self.assertIn("not_ready_preview_blocked", self.report["labels"])
        self.assertNotIn("not_ready_browser_decode_blocked", self.report["labels"])
        self.assertNotIn("not_ready_budget_blocked", self.report["labels"])
        self.assertFalse(self.report["ready_to_request_product_admission"])

    def test_manual_approval_requirements_are_explicit(self):
        requirements = self.report["manual_approval_requirements"]
        self.assertIn("explicit human approval", requirements["product_admission"])
        self.assertIn("precheck only", requirements["ad0_scope"])

    def test_bundle_and_qa_summary(self):
        summary = self.report["summary"]
        self.assertLessEqual(summary["bundle_bytes"], 100_000_000)
        self.assertEqual(summary["qa_fail_count"], 0)
        self.assertGreaterEqual(summary["qa_pass_count"], 24)


if __name__ == "__main__":
    unittest.main()
