import unittest

from src.product_prelaunch.candidate_binding import is_same_origin_path, release_blockers


class R28P0BPrelaunchAcceptanceTests(unittest.TestCase):
    def test_same_origin_manifest_paths_reject_remote_urls(self):
        self.assertTrue(is_same_origin_path("another_brain/model_candidates/r28p0b/new_96m/q4/manifest.json"))
        self.assertFalse(is_same_origin_path("https://example.test/model.bin"))
        self.assertFalse(is_same_origin_path("../model.bin"))

    def test_release_blockers_keep_non_admission_boundaries(self):
        blockers = release_blockers(
            {
                "handoff_status": "product_path_engineering_candidate",
                "budget_row": {"full_static_bundle_estimate_bytes": 98385593},
            }
        )
        self.assertIn("product_admission_pending", blockers)
        self.assertIn("browser_admission_pending", blockers)
        self.assertIn("release_checkpoint_pending", blockers)
        self.assertNotIn("budget_over_100mb", blockers)


if __name__ == "__main__":
    unittest.main()
