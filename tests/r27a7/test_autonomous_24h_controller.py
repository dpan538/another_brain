import unittest

from src.training.campaign.r27a7_autonomous_controller import default_policy
from src.training.campaign.r27a7_early_stop import should_stop
from src.training.campaign.r27a7_segment_scheduler import schedule_for_caps


class R27A7AutonomousControllerTests(unittest.TestCase):
    def test_policy_is_not_product_training(self):
        policy = default_policy()
        self.assertFalse(policy["product_training"])
        self.assertFalse(policy["formal_decoder_training"])
        self.assertFalse(policy["phase_4"])
        self.assertFalse(policy["release_checkpoint"])

    def test_schedule_respects_caps(self):
        sched = schedule_for_caps(3, 1000, 1_000_000)
        self.assertLessEqual(sum(s["steps"] for s in sched), 1000)
        self.assertLessEqual(sum(s["tokens"] for s in sched), 1_000_000)

    def test_early_stop_nan(self):
        self.assertTrue(should_stop({"stages": []}, {"dev_loss": float("nan")})[0])


if __name__ == "__main__":
    unittest.main()
