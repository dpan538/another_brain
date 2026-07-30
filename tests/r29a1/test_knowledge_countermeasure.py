import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r29a1_knowledge_countermeasure as campaign


class R29A1KnowledgeCountermeasureTests(unittest.TestCase):
    def test_policy_is_bounded_and_assistant_only(self):
        self.assertEqual(campaign.CAMPAIGN_POLICY["selected_model"], "new_96m")
        self.assertEqual(campaign.CAMPAIGN_POLICY["loss_mask_policy"], "assistant_response_only")
        self.assertEqual(campaign.CAMPAIGN_POLICY["max_optimizer_tokens"], 400_000)
        self.assertFalse(campaign.CAMPAIGN_POLICY["allow_weight_commit"])

    def test_mix_has_disjoint_heldout_sources_and_tone(self):
        with tempfile.TemporaryDirectory() as directory:
            report = campaign.build_mix(Path(directory), write_artifacts=True)
        self.assertTrue(report["ok"])
        self.assertEqual(report["split_source_overlap"], [])
        self.assertEqual(report["tone_profile"]["answer_order"], ["结论", "依据与不确定性", "分级对策", "代价或边界"])
        self.assertFalse(report["raw_external_text_ingested"])

    def test_rows_enforce_evidence_action_boundary_shape(self):
        row = campaign._row(campaign.TRAIN_CARDS[0], 1, "train")
        self.assertIn("结论：", row["target"])
        self.assertIn("依据：", row["target"])
        self.assertIn("对策：", row["target"])
        self.assertIn("边界：", row["target"])
        self.assertFalse(row["source_card"]["raw_source_ingested"])
