import unittest

from scripts.r28d8_vercel_static_asset_admission_audit import (
    build_audit_report,
    is_vercel_ignored,
    load_vercelignore_rules,
)


class R28D8VercelStaticAssetAdmissionAuditTests(unittest.TestCase):
    def test_vercelignore_bin_rule_would_drop_q4_shards_without_reinclude(self):
        rules = load_vercelignore_rules("*.bin\n")
        ignored, matched = is_vercel_ignored(
            "web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
            rules,
        )
        self.assertTrue(ignored)
        self.assertEqual(matched, ["*.bin"])

    def test_r28m1_reinclude_overrides_global_bin_exclude(self):
        rules = load_vercelignore_rules("*.bin\n!web/another_brain/model_assets/r28m1/**\n")
        ignored, matched = is_vercel_ignored(
            "web/another_brain/model_assets/r28m1/shards/model-q4-00001.bin",
            rules,
        )
        self.assertFalse(ignored)
        self.assertEqual(matched, ["*.bin", "!web/another_brain/model_assets/r28m1/**"])

    def test_current_r28m1_assets_are_present_tracked_and_not_vercel_ignored(self):
        report = build_audit_report(run_builds=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["assets"]["q4_shard_count"], 5)
        self.assertTrue(report["assets"]["tokenizer_runtime_exists"])


if __name__ == "__main__":
    unittest.main()
