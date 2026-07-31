import tempfile
import unittest
from pathlib import Path
from src.training.campaign import r29a3_cross_concept_generalization as campaign

class R29A3CrossConceptGeneralizationTests(unittest.TestCase):
    def test_policy_is_bounded_and_not_product_training(self):
        self.assertEqual(campaign.CAMPAIGN_POLICY["selected_model"], "new_96m")
        self.assertEqual(campaign.CAMPAIGN_POLICY["max_optimizer_tokens"], 320_000)
        self.assertFalse(campaign.CAMPAIGN_POLICY["allow_weight_commit"])
        self.assertFalse(campaign.CAMPAIGN_POLICY["browser_admission"])

    def test_curriculum_is_disjoint_and_varied(self):
        with tempfile.TemporaryDirectory() as directory:
            report = campaign.build_mix(Path(directory), write_artifacts=True)
        self.assertTrue(report["ok"])
        self.assertGreater(report["counts"]["train"], 100)
        self.assertGreater(report["counts"]["heldout"], 30)
        self.assertEqual(report["split_source_overlap"], [])
        self.assertEqual(report["curriculum_modes"], ["diagnose", "compare", "counterexample", "action"])

    def test_heldout_concepts_are_not_training_concepts(self):
        self.assertFalse({card[0] for card in campaign.TRAIN_CARDS} & {card[0] for card in campaign.HELDOUT_CARDS})
