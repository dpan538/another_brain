import unittest

from src.training.campaign.r27a7r2_salvage import salvage_previous_a7r


class PreviousA7RSalvageTests(unittest.TestCase):
    def test_salvage_reports_required_fields(self):
        report = salvage_previous_a7r()
        self.assertIn("active_training_approval", report)
        self.assertIn("partial_checkpoints", report)
        self.assertIn("training_processes", report)
        self.assertFalse(report["old_partial_artifacts_resume_target"])


if __name__ == "__main__":
    unittest.main()
