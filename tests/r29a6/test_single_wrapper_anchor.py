import unittest
from src.training.campaign import r29a6_single_wrapper_anchor as campaign
from src.training.campaign.r29a0_masked_debug import format_prompt
class R29A6SingleWrapperAnchorTests(unittest.TestCase):
 def test_row_has_one_chat_wrapper(self):
  row=campaign.clean_row(campaign.prior.TRAIN_CARDS[0],0,"train")
  self.assertFalse(row["input"].startswith("用户："))
  prompt=format_prompt(row)
  self.assertEqual(prompt.count("用户："),1); self.assertEqual(prompt.count("回答："),1)
 def test_policy_is_bounded(self): self.assertEqual(campaign.CAMPAIGN_POLICY["evaluation_interval_optimizer_tokens"],20000)
