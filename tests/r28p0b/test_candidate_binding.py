import tempfile
import unittest
from pathlib import Path

from src.product_prelaunch.candidate_binding import bind_candidate, export_candidate, loader_smoke, quantize_candidate


class R28P0BCandidateBindingTests(unittest.TestCase):
    def sample_intake(self):
        return {
            "handoff_status": "product_path_engineering_candidate",
            "candidate_route": "product_path_engineering_candidate",
            "selected_model": "new_96m",
            "best_checkpoint_path": "/tmp/example.pt",
            "best_checkpoint_exists": True,
            "budget_row": {
                "model_bytes": 48181504,
                "full_static_bundle_estimate_bytes": 98385593,
                "classification": "product_path_tight",
            },
        }

    def test_binding_is_metadata_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = bind_candidate(intake=self.sample_intake(), artifact_root=Path(tmp))
        self.assertTrue(report["ok"])
        self.assertTrue(report["bound_model"])
        self.assertFalse(report["candidate_static_bundle"])
        self.assertFalse(report["model_assets_committed"])
        self.assertEqual(report["budget_status"], "under_100mb")

    def test_export_quantize_and_loader_smoke_do_not_write_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            artifact_root = Path(tmp)
            binding = bind_candidate(intake=self.sample_intake(), artifact_root=artifact_root)
            export = export_candidate(binding=binding, artifact_root=artifact_root)
            quant = quantize_candidate(binding=binding, artifact_root=artifact_root)
            smoke = loader_smoke(binding=binding, artifact_root=artifact_root)
        self.assertFalse(export["weights_copied"])
        self.assertFalse(quant["actual_quantized_assets_written"])
        self.assertTrue(smoke["same_origin_manifest_smoke"])
        self.assertFalse(smoke["actual_asset_load"])


if __name__ == "__main__":
    unittest.main()
