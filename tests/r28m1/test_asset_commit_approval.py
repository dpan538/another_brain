import tempfile
import unittest
from pathlib import Path

from src.browser_export.r28m1_asset_commit import APPROVAL_PATH, check_asset_commit_approval, write_json


class R28M1AssetCommitApprovalTests(unittest.TestCase):
    def test_committed_approval_metadata_is_narrow_and_detected(self):
        report = check_asset_commit_approval(APPROVAL_PATH)
        self.assertTrue(report["ok"], report.get("failures"))
        self.assertTrue(report["approval_detected"])
        scope = report["scope"]
        self.assertTrue(scope["a12_new_96m_q4_static_shards"])
        self.assertFalse(scope["raw_checkpoint"])
        self.assertFalse(scope["future_models"])
        self.assertFalse(scope["product_admission"])
        self.assertFalse(scope["browser_admission"])
        self.assertFalse(scope["release_checkpoint_admission"])
        self.assertFalse(scope["phase_4"])

    def test_missing_approval_blocks_asset_commit(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = check_asset_commit_approval(Path(tmp) / "missing.json")
        self.assertFalse(report["ok"])
        self.assertIn("approval_metadata_missing", report["failures"])

    def test_approval_cannot_expand_to_raw_or_future_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "approval.json"
            write_json(
                path,
                {
                    "approval_marker": "R28M1_STATIC_MODEL_ASSET_COMMIT_ALLOWED",
                    "approved": True,
                    "scope": {
                        "a12_new_96m_q4_static_shards": True,
                        "runtime_tokenizer_asset": True,
                        "model_config": True,
                        "quantization_manifest": True,
                        "shard_checksum_manifest": True,
                        "asset_manifest_metadata": True,
                        "tests_docs_scripts": True,
                        "raw_checkpoint": True,
                        "unquantized_weights": False,
                        "optimizer_state": False,
                        "training_artifacts": False,
                        "training_corpus": False,
                        "future_models": True,
                        "product_admission": False,
                        "browser_admission": False,
                        "release_checkpoint_admission": False,
                        "phase_4": False,
                    },
                    "exclusions": {
                        "raw_checkpoint": True,
                        "unquantized_weights": True,
                        "optimizer_state": True,
                        "training_artifacts": True,
                        "training_corpus": True,
                        "future_models": True,
                        "product_admission": True,
                        "browser_admission": True,
                        "release_checkpoint_admission": True,
                        "phase_4": True,
                    },
                },
            )
            report = check_asset_commit_approval(path)
        self.assertFalse(report["ok"])
        self.assertIn("forbidden_scope_not_false:raw_checkpoint", report["failures"])
        self.assertIn("forbidden_scope_not_false:future_models", report["failures"])


if __name__ == "__main__":
    unittest.main()
