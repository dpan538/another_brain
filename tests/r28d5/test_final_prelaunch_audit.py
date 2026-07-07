import unittest

from scripts.r28d5_final_prelaunch_audit import final_prelaunch_audit


class R28D5FinalPrelaunchAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = final_prelaunch_audit(run_rt1_smoke=False)

    def test_audit_passes_on_rt1_base(self):
        self.assertTrue(self.report["ok"], self.report.get("failures"))
        self.assertEqual(self.report["base_priority_selected"], "origin/r28rt1-real-q4-forward")

    def test_q4_assets_and_budget_are_present(self):
        self.assertTrue(self.report["q4_assets"]["ok"], self.report["q4_assets"].get("failures"))
        self.assertEqual(self.report["q4_assets"]["shard_count"], 5)
        self.assertLess(self.report["q4_assets"]["max_shard_bytes"], 25_000_000)
        self.assertLessEqual(self.report["budget"]["full_bundle_bytes"], 100_000_000)

    def test_routes_and_boundaries_are_visible(self):
        routes = self.report["routes"]
        for key in ("chat_route", "rag_route", "adapter_bridge", "asset_cache", "fallback_path"):
            self.assertTrue(routes[key], key)
        self.assertTrue(self.report["static_only"]["ok"], self.report["static_only"].get("failures"))

    def test_rt1_real_forward_status_is_declared(self):
        forward = self.report["real_q4_forward"]
        self.assertTrue(forward["ok"], forward)
        self.assertEqual(forward["runtime_mode"], "static_q4_experimental")
        self.assertGreaterEqual(forward["declared_generated_token_count"], 1)

    def test_non_claims_remain_false(self):
        self.assertTrue(self.report["non_claims"]["ok"], self.report["non_claims"].get("failures"))
        checked = self.report["non_claims"]["checked"]
        self.assertFalse(checked["runtime_phase_4"])
        self.assertFalse(checked["backend_inference"])
        self.assertFalse(checked["external_llm_api"])


if __name__ == "__main__":
    unittest.main()
