import unittest

from src.training.campaign.r27a8b_evaluation import write_candidate_if_safe


class R27A8BEvaluationHandoffTests(unittest.TestCase):
    def test_handoff_decision_is_not_product_admission(self):
        report = write_candidate_if_safe("unit_test_campaign")
        self.assertTrue(report["ok"])
        self.assertFalse(report["browser_admission"])
        self.assertFalse(report["product_model_admission"])
        self.assertFalse(report["release_checkpoint"])
