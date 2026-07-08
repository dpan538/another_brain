import unittest

from scripts.r28merge2_final_premerge_gate import OUTPUT_LABELS, final_premerge_gate


class R28MERGE2FinalPremergeGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = final_premerge_gate(run_q4_smoke=False, run_training_commands=False)

    def test_selects_rag3_base_priority(self):
        self.assertEqual(self.report["selected_base"]["branch"], "r28rag3-lightweight-profile-rag")
        self.assertEqual(self.report["selected_base"]["selected"], "origin/r28rag3-lightweight-profile-rag")

    def test_label_is_known_and_no_auto_merge(self):
        self.assertIn(self.report["output_label"], OUTPUT_LABELS)
        self.assertFalse(self.report["auto_merge"])
        self.assertEqual(self.report["merge_decision"], "do_not_merge")
        self.assertFalse(self.report["can_merge"])
        self.assertTrue(self.report["can_preview"])
        self.assertEqual(self.report["output_label"], "preview_ready_not_merge_ready")

    def test_runtime_q4_tokenizer_and_selfcheck_are_ready(self):
        for section in [
            "q4_assets_admitted",
            "q4_forward_status",
            "exact_tokenizer",
            "self_check_nonblocking",
            "identity_greeting_fast_route",
        ]:
            self.assertTrue(self.report[section]["ok"], (section, self.report[section].get("failures")))
        self.assertEqual(self.report["q4_forward_status"]["runtime_mode"], "static_q4_experimental")
        self.assertGreaterEqual(self.report["q4_forward_status"]["declared_generated_token_count"], 1)

    def test_ui_modes_and_release_blockers_are_visible(self):
        self.assertTrue(self.report["ui_surfaces"]["ok"], self.report["ui_surfaces"].get("failures"))
        self.assertTrue(self.report["release_blockers_visible"]["ok"], self.report["release_blockers_visible"].get("failures"))
        self.assertTrue(self.report["release_blockers_visible"]["blockers"])

    def test_static_budget_nonclaims_and_training_gates_are_safe(self):
        self.assertTrue(self.report["budget"]["ok"], self.report["budget"].get("failures"))
        self.assertTrue(self.report["static_only"]["ok"], self.report["static_only"].get("failures"))
        self.assertTrue(self.report["no_product_claim"]["ok"], self.report["no_product_claim"].get("failures"))
        self.assertTrue(self.report["training_gates"]["ok"], self.report["training_gates"].get("failures"))
        self.assertEqual(self.report["asset_summary"]["ui_version"], "r28rag3-lightweight-profile-rag")


if __name__ == "__main__":
    unittest.main()
