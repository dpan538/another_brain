import unittest

from src.training.campaign.early_stop_policy_v3 import minimum_budget_met, should_stop_v3


class EarlyStopPolicyV3Tests(unittest.TestCase):
    def test_metric_stop_waits_for_minimum_budget(self):
        stop, reason = should_stop_v3("dev_loss_no_improvement", 587, 5_324_800, 3)
        self.assertFalse(stop)
        self.assertEqual(reason, "defer_dev_loss_no_improvement_until_minimum_budget")

    def test_hard_stop_allowed_before_minimum(self):
        self.assertTrue(should_stop_v3("active_marker_invalid", 1, 0, 1)[0])

    def test_metric_stop_after_minimum(self):
        self.assertTrue(minimum_budget_met(4 * 3600, 15_000_000, 4))
        self.assertTrue(should_stop_v3("dev_loss_no_improvement", 4 * 3600, 15_000_000, 4)[0])


if __name__ == "__main__":
    unittest.main()
