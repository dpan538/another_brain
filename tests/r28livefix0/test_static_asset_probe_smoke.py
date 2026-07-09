import unittest

from scripts.r28livefix0_static_asset_probe_smoke import static_asset_probe_smoke


class R28Livefix0StaticAssetProbeSmokeTests(unittest.TestCase):
    def test_static_asset_probe_smoke_passes_without_content_length_requirement(self):
        report = static_asset_probe_smoke(write_report=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["q4_shard_count"], 5)
        self.assertFalse(report["content_length_required"])
        self.assertFalse(report["head_only_allowed"])


if __name__ == "__main__":
    unittest.main()
