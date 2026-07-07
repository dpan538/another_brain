import json
import unittest
from pathlib import Path

from src.browser_export.r28m1_asset_commit import ASSET_ROOT, SHARD_ROOT, discover_handoff
from src.product_prelaunch.candidate_binding import is_same_origin_path


class R28M1AssetGenerationTests(unittest.TestCase):
    def test_handoff_points_to_new_96m_engineering_candidate(self):
        report = discover_handoff()
        self.assertTrue(report["ok"], report.get("failures"))
        self.assertEqual(report["selected_model"], "new_96m")
        self.assertEqual(report["handoff_status"], "product_path_engineering_candidate")
        self.assertEqual(report["safety_guard"], "clean")

    def test_generated_static_manifests_are_sanitized_when_present(self):
        manifest = ASSET_ROOT / "quantization.manifest.json"
        if not manifest.exists():
            self.skipTest("R28M1 static assets not generated yet")
        data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(data["quantization"], "q4")
        self.assertTrue(data["same_origin_only"])
        self.assertNotIn("quantized_path", data)
        self.assertNotIn("/Users/", json.dumps(data))
        self.assertNotIn("/private/tmp", json.dumps(data))
        self.assertGreater(data["shard_count"], 0)
        self.assertLessEqual(data["max_shard_bytes"], 25_000_000)
        for shard in data["shards"]:
            self.assertTrue(is_same_origin_path(shard["path"]))
            self.assertTrue((Path("web") / shard["path"]).exists())

    def test_only_expected_q4_bin_assets_are_present_when_generated(self):
        if not SHARD_ROOT.exists():
            self.skipTest("R28M1 shards not generated yet")
        for path in SHARD_ROOT.glob("*.bin"):
            self.assertTrue(path.name.startswith("model-q4-"))
            self.assertLessEqual(path.stat().st_size, 25_000_000)


if __name__ == "__main__":
    unittest.main()
