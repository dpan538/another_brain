import tempfile
import unittest
from pathlib import Path
from src.training.campaign import r29a4_concept_anchor_recovery as campaign

class R29A4ConceptAnchorRecoveryTests(unittest.TestCase):
    def test_is_short_bounded_and_chinese(self):
        self.assertEqual(campaign.CAMPAIGN_POLICY["max_optimizer_tokens"], 120_000)
        self.assertEqual(campaign.CAMPAIGN_POLICY["evaluation_interval_optimizer_tokens"], 30_000)
        self.assertFalse(campaign.CAMPAIGN_POLICY["allow_weight_commit"])
        self.assertTrue(all("_" not in row[0] for row in campaign.HELDOUT_CARDS))

    def test_heldout_concepts_are_disjoint_and_mix_uses_r29a4_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            report = campaign.build_mix(root, write_artifacts=True)
            self.assertTrue((root / "artifacts/r29a4/training_mix/train.jsonl").exists())
        self.assertTrue(report["ok"])
        self.assertEqual(report["split_source_overlap"], [])
        self.assertFalse({row[0] for row in campaign.TRAIN_CARDS} & {row[0] for row in campaign.HELDOUT_CARDS})
