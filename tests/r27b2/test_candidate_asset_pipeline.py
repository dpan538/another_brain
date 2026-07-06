import unittest

from src.browser_export.candidate_asset_writer import (
    SHARD_DIR,
    write_candidate_static_manifest,
    write_export_report,
    write_quantization_report,
)
from src.browser_export.candidate_discovery import synthetic_candidate
from src.browser_export.model_reconstruct import reconstruct_candidate_model


class R27B2CandidateAssetPipelineTests(unittest.TestCase):
    def test_pipeline_writes_ignored_static_manifest_contract(self):
        reconstruction = reconstruct_candidate_model(synthetic_candidate(), synthetic_if_missing=True)
        export_report = write_export_report(reconstruction)
        quantization_report = write_quantization_report(export_report, "q4")
        manifest = write_candidate_static_manifest(export_report, quantization_report)

        self.assertFalse(manifest["product_model"])
        self.assertFalse(manifest["browser_admission"])
        self.assertTrue(manifest["same_origin_only"])
        self.assertEqual(manifest["runtime_mode"], "static_shard_manifest_experimental")
        self.assertEqual(manifest["quantization"], "q4_experimental")
        self.assertGreater(len(manifest["shards"]), 0)
        for shard in manifest["shards"]:
            self.assertFalse(shard["path"].startswith(("http://", "https://", "//", "/")))
            self.assertTrue((SHARD_DIR / shard["path"]).exists())


if __name__ == "__main__":
    unittest.main()
