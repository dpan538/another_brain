import unittest

from src.training.campaign.a8b_launch_config import build_a8b_launch_config


class A8BLaunchConfigTests(unittest.TestCase):
    def test_ready_config_uses_optimizer_tokens_and_does_not_admit_product(self):
        config = build_a8b_launch_config(
            {"active_training_approval": False, "corrupted_checkpoints": []},
            {"ok": True},
            {"selected_device": "mps", "disk_space_critical": False},
            {"selected_device": "mps", "selected_candidate": {"candidate": "new_60m", "ok": True, "context_length": 256}},
            {"ok": True, "selected_checkpoint": "artifacts/r27a7/best.pt"},
        )
        self.assertTrue(config["ready"])
        self.assertEqual(config["primary_token_metric"], "optimizer_tokens")
        self.assertIsNone(config["selected_checkpoint"])
        self.assertFalse(config["phase_4"])
        self.assertFalse(config["browser_admission"])

    def test_blocked_config_records_active_approval(self):
        config = build_a8b_launch_config(
            {"active_training_approval": True, "corrupted_checkpoints": []},
            {"ok": True},
            {"selected_device": "cpu", "disk_space_critical": False},
            {"selected_device": "cpu", "selected_candidate": {"candidate": "continue_best_mini8m", "ok": True}},
            {"ok": True, "selected_checkpoint": "artifacts/r27a7/best.pt"},
        )
        self.assertFalse(config["ready"])
        self.assertIn("active_approval_stuck", config["blockers"])


if __name__ == "__main__":
    unittest.main()
