import unittest

from scripts.r28d8_vercel_static_asset_admission_audit import build_audit_report


class R28D8StaticLlmAssetsAdmittedTests(unittest.TestCase):
    def test_static_llm_assets_are_deployable_without_artifact_paths(self):
        report = build_audit_report(run_builds=False)
        self.assertTrue(report["ok"], report["failures"])
        assets = report["assets"]
        self.assertEqual(assets["q4_shard_count"], assets["quantization_manifest_shard_count"])
        self.assertEqual(assets["q4_shard_count"], 5)
        self.assertLess(assets["full_bundle_estimate_bytes"], assets["max_total_static_bytes"])
        for row in assets["expected_assets"]:
            self.assertFalse(row["path"].startswith("artifacts/"), row["path"])
            self.assertFalse(row["vercel_ignored"], row["path"])
            self.assertTrue(row["tracked_by_git"], row["path"])

    def test_runtime_non_claims_remain_false(self):
        report = build_audit_report(run_builds=False)
        runtime = report["assets"]["runtime_mode"]
        for key in ["backend_inference", "external_llm_api", "doubao", "hosted_vector_store", "product_model"]:
            self.assertIs(runtime[key], False, key)


if __name__ == "__main__":
    unittest.main()
