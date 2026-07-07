import unittest

from scripts.r28p1_release_candidate_gate import GATE_CHECK_IDS, claim_checks
from src.product_prelaunch.r28p1_intake import REQUIRED_RELEASE_BLOCKERS


class R28P1ReleaseCandidateGateTests(unittest.TestCase):
    def test_gate_declares_all_required_checks(self):
        self.assertEqual(len(GATE_CHECK_IDS), 21)
        for check_id in [
            "npm_run_build_passes",
            "npm_run_build_vercel_passes",
            "bundle_under_100mb",
            "static_only_pass",
            "no_backend_inference",
            "no_external_llm",
            "no_doubao",
            "no_hosted_vector_store",
            "no_model_assets_committed",
            "no_tokenizer_artifacts_committed",
            "no_exported_shards_committed",
            "no_product_model_claim",
            "no_browser_admission_claim",
            "no_release_checkpoint_claim",
            "chat_route_smoke",
            "rag_demo_smoke",
            "adapter_bridge_smoke",
            "asset_cache_smoke",
            "non_product_warning_visible",
            "candidate_status_visible",
            "release_blockers_visible",
        ]:
            self.assertIn(check_id, GATE_CHECK_IDS)

    def test_claim_checks_accept_only_non_admission_runtime_flags(self):
        checks = claim_checks(
            {
                "runtime": {
                    "product_model": False,
                    "product_admission": False,
                    "browser_admission": False,
                    "release_checkpoint": False,
                    "phase_4": False,
                }
            }
        )
        self.assertTrue(all(checks.values()))

    def test_release_blocker_inventory_matches_required_demo_package(self):
        expected = {
            "real_model_assets_not_admitted_or_committed",
            "same_origin_model_shard_loader_not_tested_with_real_committed_shards",
            "product_model_admission_not_done",
            "browser_admission_not_done",
            "release_checkpoint_admission_not_done",
            "vercel_preview_must_pass",
            "100mb_margin_tight",
            "final_merge_to_main_pending",
        }
        self.assertEqual(set(REQUIRED_RELEASE_BLOCKERS), expected)


if __name__ == "__main__":
    unittest.main()
