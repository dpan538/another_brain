import unittest

from src.browser_export.export_manifest import make_export_manifest, validate_export_manifest


class R27B1AExportManifestSchemaTests(unittest.TestCase):
    def test_manifest_defaults_are_static_only_non_admission(self):
        manifest = make_export_manifest(config={"vocab_size": 32}, tensors=[{"name": "w", "shape": [2, 2], "dtype": "float32", "numel": 4}])
        self.assertEqual(validate_export_manifest(manifest), [])
        self.assertTrue(manifest["same_origin_only"])
        self.assertFalse(manifest["backend_inference"])
        self.assertFalse(manifest["browser_admission"])
        self.assertFalse(manifest["product_admission"])
        self.assertFalse(manifest["model_assets_committed"])

    def test_manifest_rejects_external_asset_paths(self):
        manifest = make_export_manifest(assets=[{"path": "https://example.test/model.bin"}])
        self.assertIn("external_asset_path:https://example.test/model.bin", validate_export_manifest(manifest))


if __name__ == "__main__":
    unittest.main()
