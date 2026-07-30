import unittest

from src.training.campaign.r29a2_knowledge_addon_readiness import KNOWLEDGE_ADDON_FORMS, evaluate_readiness


class R29A2KnowledgeAddonReadinessTests(unittest.TestCase):
    def test_addon_forms_preserve_local_and_training_boundaries(self):
        self.assertEqual([item["id"] for item in KNOWLEDGE_ADDON_FORMS], [
            "same_origin_static_pack",
            "local_session_context",
            "knowledge_countermeasure_curriculum",
        ])
        self.assertEqual(KNOWLEDGE_ADDON_FORMS[1]["training_use"], "never included in training without a separate explicit approval")

    def test_150m_is_not_static_product_eligible_until_forward_gate_exists(self):
        report = evaluate_readiness()
        self.assertFalse(report["scale_candidate"]["static_product_eligible"])
        self.assertLess(report["scale_candidate"]["remaining_bytes_under_100mb"], 0)
        self.assertIn("150m_architecture_not_selected", report["blockers"])
        self.assertIn("q4_transformer_forward_not_implemented", report["blockers"])
