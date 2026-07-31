import tempfile
import unittest
from pathlib import Path
from src.training.campaign import r29a5_chat_format_anchor as campaign

class R29A5ChatFormatAnchorTests(unittest.TestCase):
    def test_policy_is_short_and_bounded(self):
        self.assertEqual(campaign.CAMPAIGN_POLICY["max_optimizer_tokens"], 60_000)
        self.assertEqual(campaign.CAMPAIGN_POLICY["evaluation_interval_optimizer_tokens"], 20_000)
        self.assertFalse(campaign.CAMPAIGN_POLICY["allow_weight_commit"])
    def test_rows_match_probe_chat_format_and_name_concept(self):
        row = campaign.chat_row(campaign.TRAIN_CARDS[0], 0, "train")
        self.assertTrue(row["input"].startswith("用户：因果方向"))
        self.assertIn("类别：cross_concept_reasoning", row["input"])
        self.assertTrue(row["input"].endswith("回答："))
        self.assertTrue(row["target"].startswith("因果方向："))
    def test_mix_is_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); report=campaign.build_mix(root, write_artifacts=True)
            self.assertTrue((root/"artifacts/r29a5/training_mix/train.jsonl").exists())
        self.assertTrue(report["ok"])
        self.assertEqual(report["split_source_overlap"], [])
