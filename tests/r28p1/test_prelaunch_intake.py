import json
import tempfile
import unittest
from pathlib import Path

from src.product_prelaunch.r28p1_intake import (
    RELEASE_CANDIDATE_MODE,
    REQUIRED_RELEASE_BLOCKERS,
    build_prelaunch_intake,
    classify_tracked_forbidden_assets,
)


class R28P1PrelaunchIntakeTests(unittest.TestCase):
    def make_root(self, tmp: Path) -> Path:
        (tmp / "data/training_registry").mkdir(parents=True)
        (tmp / "web/another_brain").mkdir(parents=True)
        (tmp / "web/another_brain_chat").mkdir(parents=True)
        (tmp / "data/training_registry/r27a12_browser_handoff_summary.json").write_text(
            json.dumps(
                {
                    "candidate_route": "product_path_engineering_candidate",
                    "selected_model": "new_96m",
                    "budget_row": {
                        "full_static_bundle_estimate_bytes": 98385593,
                        "remaining_bytes_under_100mb": 1614407,
                    },
                }
            ),
            encoding="utf-8",
        )
        (tmp / "web/another_brain/runtime_mode.json").write_text(
            json.dumps(
                {
                    "delivery_mode": "demo_static",
                    "model_mode": "candidate_manifest_experimental",
                    "backend_inference": False,
                    "external_llm_api": False,
                    "hosted_vector_store": False,
                    "product_model": False,
                    "product_admission": False,
                    "browser_admission": False,
                    "release_checkpoint": False,
                    "candidate_static_bundle": False,
                    "candidate_route": "product_path_engineering_candidate",
                    "selected_model": "new_96m",
                    "full_static_bundle_estimate_bytes": 98385593,
                    "remaining_bytes_under_100mb": 1614407,
                }
            ),
            encoding="utf-8",
        )
        (tmp / "web/another_brain/asset_manifest.json").write_text(
            json.dumps(
                {
                    "model_assets": [],
                    "tokenizer_assets": [],
                    "rag_assets": [],
                    "gate_assets": [],
                    "total_declared_bytes": 3704,
                    "same_origin_only": True,
                    "external_runtime_dependency": False,
                    "backend_inference": False,
                }
            ),
            encoding="utf-8",
        )
        (tmp / "web/another_brain_chat/index.html").write_text("<form id=\"chat-form\"></form>", encoding="utf-8")
        (tmp / "web/another_brain_chat/app.js").write_text("export {};\n", encoding="utf-8")
        return tmp

    def test_intake_schema_distinguishes_demo_shell_from_candidate_metadata(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = self.make_root(Path(tmp_dir))
            report = build_prelaunch_intake(
                root=root,
                a12_worktree=root / "missing_a12",
                live_bundle=False,
                tracked_files_loader=lambda _root: [],
            )
        self.assertEqual(report["a12_candidate_route"], "product_path_engineering_candidate")
        self.assertEqual(report["model"], "new_96m")
        self.assertTrue(report["metadata_binding_present"])
        self.assertFalse(report["real_browser_model_runtime"])
        self.assertTrue(report["static_shell_ready"])
        self.assertEqual(report["release_candidate_mode"], RELEASE_CANDIDATE_MODE)
        self.assertEqual(report["estimated_full_bundle_bytes"], 98385593)
        self.assertEqual(report["budget_margin_bytes"], 1614407)

    def test_required_release_blockers_are_always_present(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = self.make_root(Path(tmp_dir))
            report = build_prelaunch_intake(
                root=root,
                a12_worktree=root / "missing_a12",
                live_bundle=False,
                tracked_files_loader=lambda _root: [],
            )
        for blocker in REQUIRED_RELEASE_BLOCKERS:
            self.assertIn(blocker, report["hard_blockers"])
            self.assertIn(blocker, report["release_blockers"])

    def test_asset_scan_allows_only_legacy_tiny_tokenizer_fixture(self):
        scan = classify_tracked_forbidden_assets(
            [
                "static_llm/fixtures/tiny_decoder_fixture/tokenizer.json",
                "web/another_brain/model_candidates/r28p1/shard_00001.bin",
                "artifacts/r28p1/tokenizer.json",
            ]
        )
        self.assertEqual(scan["allowed_legacy_fixtures"], ["static_llm/fixtures/tiny_decoder_fixture/tokenizer.json"])
        self.assertEqual(scan["tokenizer_artifacts"], ["artifacts/r28p1/tokenizer.json"])
        self.assertEqual(scan["model_assets"], ["web/another_brain/model_candidates/r28p1/shard_00001.bin"])


if __name__ == "__main__":
    unittest.main()
