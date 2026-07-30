import unittest

from src.training.campaign.r27a8b_controller import CAMPAIGN_POLICY, normal_schedule
from src.training.campaign.early_stop_policy_v3 import should_stop_v3


class R27A8BOvernightPolicyTests(unittest.TestCase):
    def test_policy_is_not_product_or_phase4(self):
        self.assertFalse(CAMPAIGN_POLICY["product_training"])
        self.assertFalse(CAMPAIGN_POLICY["formal_decoder_training"])
        self.assertFalse(CAMPAIGN_POLICY["phase_4"])
        self.assertFalse(CAMPAIGN_POLICY["release_checkpoint"])
        self.assertEqual(CAMPAIGN_POLICY["active_approval_after_completion"], 0)

    def test_metric_stop_deferred_before_minimum(self):
        stop, reason = should_stop_v3("dev_loss_no_improvement", wall_clock_seconds=600, optimizer_tokens=1_000_000, segment_count=2)
        self.assertFalse(stop)
        self.assertIn("defer_dev_loss_no_improvement", reason)

    def test_normal_schedule_uses_requested_stage_mix(self):
        sched = normal_schedule(4)
        self.assertEqual([s["stage_id"] for s in sched], ["chinese_first_pretraining", "sft_dialogue", "rag_value_answer_as_user", "consolidation"])
        self.assertEqual(sched[0]["stage_mix"]["public_chinese_pretraining"], 50)
