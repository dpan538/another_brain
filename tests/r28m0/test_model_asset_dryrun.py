import json
import tempfile
import unittest
from pathlib import Path

from src.product_prelaunch.r28m0_dryrun import (
    HARD_MAX_SHARD_BYTES,
    admission_label,
    export_a12_candidate,
    is_same_origin_path,
    write_shards,
)


class R28M0ModelAssetDryRunTests(unittest.TestCase):
    def sample_intake(self, checkpoint: Path | None = None):
        return {
            "handoff_exists": True,
            "summary_exists": True,
            "handoff_status": "product_path_engineering_candidate",
            "selected_model": "new_96m",
            "best_checkpoint_path": checkpoint.as_posix() if checkpoint else None,
            "best_checkpoint_exists": bool(checkpoint),
            "handoff_source": "/tmp/handoff.json",
            "summary_source": "/tmp/summary.json",
            "finalizer_source": "/tmp/finalizer.json",
            "safety_guard": "clean",
            "hard_blockers": [],
            "budget_row": {"tokenizer_bytes_estimate": 4_000_000},
        }

    def test_missing_handoff_blocks_real_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            artifact_root = Path(tmp)
            report = export_a12_candidate(
                intake={
                    "handoff_exists": False,
                    "summary_exists": False,
                    "handoff_status": "no_model",
                    "hard_blockers": ["no_a12_candidate_handoff"],
                },
                artifact_root=artifact_root,
            )
        self.assertFalse(report["ok"])
        self.assertIn("missing_handoff", report["hard_blockers"])
        self.assertFalse(report["weights_copied"])

    def test_same_origin_path_rejects_remote_absolute_and_parent_paths(self):
        self.assertTrue(is_same_origin_path("another_brain/model_assets/r28m0/new_96m/q4/shard.bin"))
        self.assertFalse(is_same_origin_path("https://example.com/shard.bin"))
        self.assertFalse(is_same_origin_path("/another_brain/model_assets/shard.bin"))
        self.assertFalse(is_same_origin_path("../shard.bin"))

    def test_write_shards_uses_same_origin_paths_and_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            artifact_root = Path(tmp)
            quantized_dir = artifact_root / "quantized"
            quantized_dir.mkdir(parents=True)
            payload = bytes(range(256)) * 100
            quantized = quantized_dir / "a12_new_96m_q4.bin"
            quantized.write_bytes(payload)
            (quantized_dir / "q4_manifest.json").write_text(
                json.dumps(
                    {
                        "ok": True,
                        "selected_model": "new_96m",
                        "quantized_path": quantized.as_posix(),
                        "actual_quantized_bytes": len(payload),
                        "sha256": "test-sha",
                    }
                ),
                encoding="utf-8",
            )
            report = write_shards(target_shard_mb=1, artifact_root=artifact_root)
        self.assertTrue(report["ok"])
        self.assertGreater(report["shard_count"], 0)
        self.assertLess(report["max_shard_bytes"], HARD_MAX_SHARD_BYTES)
        self.assertTrue(all(is_same_origin_path(shard["same_origin_path"]) for shard in report["shards"]))

    def test_admission_label_order(self):
        self.assertEqual(admission_label({"missing_handoff": True}), "missing_handoff")
        self.assertEqual(admission_label({"safety_blocker": True}), "safety_blocker")
        self.assertEqual(
            admission_label(
                {
                    "candidate_route": "product_path_engineering_candidate",
                    "loader_smoke_passed": False,
                    "margin_bytes": 1,
                }
            ),
            "loader_smoke_failed",
        )
        self.assertEqual(
            admission_label(
                {
                    "candidate_route": "product_path_engineering_candidate",
                    "loader_smoke_passed": True,
                    "margin_bytes": 1,
                }
            ),
            "ready_for_explicit_asset_commit_approval",
        )


if __name__ == "__main__":
    unittest.main()
