import unittest

from src.browser_export.r28m1_asset_commit import ASSET_ROOT, loader_smoke


class R28M1StaticModelLoaderSmokeTests(unittest.TestCase):
    def test_loader_smoke_verifies_shards_without_claiming_inference(self):
        if not (ASSET_ROOT / "quantization.manifest.json").exists():
            self.skipTest("R28M1 static assets not generated yet")
        report = loader_smoke()
        self.assertTrue(report["ok"], report.get("failures"))
        self.assertTrue(report["loader_smoke_passed"])
        self.assertFalse(report["inference_smoke_passed"])
        self.assertEqual(report["blocker"], "real_browser_inference_not_verified")
        self.assertTrue(report["tokenizer_present"])
        self.assertTrue(report["sha256_verified"])


if __name__ == "__main__":
    unittest.main()
