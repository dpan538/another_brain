import unittest

from scripts.r28merge1_final_preview_merge_gate import OUTPUT_ENUM, build_final_preview_merge_gate


class R28Merge1FinalGateTest(unittest.TestCase):
    def test_gate_outputs_allowed_merge_enum(self):
        report = build_final_preview_merge_gate()
        self.assertIn(report["output"], OUTPUT_ENUM)
        self.assertEqual(report["selected_base"], "origin/r28ux5-chat-dashboard-split")
        self.assertFalse(report["auto_merge"])

    def test_preview_ready_but_not_product_admission(self):
        report = build_final_preview_merge_gate()
        self.assertTrue(report["checks"]["no_product_claim"])
        self.assertFalse(report["runtime"]["non_claims"]["product_model"])
        self.assertFalse(report["runtime"]["non_claims"]["product_admission"])
        self.assertFalse(report["runtime"]["non_claims"]["browser_admission"])
        self.assertFalse(report["runtime"]["non_claims"]["release_checkpoint_admission"])
        self.assertIn("product_admission_not_done", report["blockers"]["merge"])

    def test_runtime_and_ui_checks_are_explicit(self):
        report = build_final_preview_merge_gate()
        for key in [
            "q4_assets_admitted",
            "q4_forward_status",
            "exact_tokenizer",
            "self_check_nonblocking",
            "identity_route_fast",
            "greeting_route_fast",
            "ui_mobile_desktop_smoke",
            "release_blockers_visible",
        ]:
            self.assertIn(key, report["checks"])


if __name__ == "__main__":
    unittest.main()
