import json
import tempfile
import unittest
from pathlib import Path

from src.training.campaign.r27a8b_launch_reader import read_launch_config


class R27A8BLaunchConfigTests(unittest.TestCase):
    def test_missing_ready_waits(self):
        with tempfile.TemporaryDirectory() as td:
            report = read_launch_config(Path(td) / "READY.json", Path(td) / "BLOCKED.json")
        self.assertFalse(report["ok"])
        self.assertEqual(report["status"], "wait")
        self.assertFalse(report["train_allowed"])

    def test_blocked_marker_wins(self):
        with tempfile.TemporaryDirectory() as td:
            blocked = Path(td) / "BLOCKED.json"
            blocked.write_text(json.dumps({"blockers": ["manual_block"]}), encoding="utf-8")
            report = read_launch_config(Path(td) / "READY.json", blocked)
        self.assertFalse(report["ok"])
        self.assertEqual(report["status"], "blocked")
        self.assertIn("manual_block", report["blockers"])

    def test_ready_config_is_safe_and_optimizer_token_primary(self):
        with tempfile.TemporaryDirectory() as td:
            ready = Path(td) / "READY.json"
            ready.write_text(
                json.dumps(
                    {
                        "ready": True,
                        "safe_to_train": True,
                        "primary_token_metric": "optimizer_tokens",
                        "selected_model": "new_100m",
                        "selected_device": "mps",
                        "product_training": False,
                        "formal_decoder_training": False,
                        "phase_4": False,
                        "product_model_admission": False,
                        "browser_admission": False,
                        "release_checkpoint": False,
                    }
                ),
                encoding="utf-8",
            )
            report = read_launch_config(ready, Path(td) / "BLOCKED.json")
        self.assertTrue(report["ok"])
        self.assertEqual(report["selected_model"], "new_100m")
        self.assertTrue(report["train_allowed"])
