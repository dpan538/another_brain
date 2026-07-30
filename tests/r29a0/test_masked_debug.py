import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r29a0_masked_debug as controller


class ToyTokenizer:
    bos = 2
    eos = 3

    def encode(self, text):
        return [self.bos] + [10 + (ord(char) % 50) for char in str(text)] + [self.eos]


class R29A0MaskedDebugTests(unittest.TestCase):
    def test_policy_is_96m_bounded_and_assistant_only(self):
        policy = controller.CAMPAIGN_POLICY
        self.assertEqual(policy["selected_model"], "new_96m")
        self.assertEqual(policy["loss_mask_policy"], "assistant_response_only")
        self.assertEqual(policy["max_optimizer_tokens"], 300_000)
        self.assertEqual(policy["evaluation_interval_optimizer_tokens"], 50_000)
        self.assertEqual(policy["learning_rate"], 5e-6)
        self.assertFalse(policy["phase_4"])
        self.assertFalse(policy["allow_weight_commit"])

    def test_prompt_and_role_tokens_are_excluded_from_loss(self):
        row = {
            "input": "什么是美？",
            "target": "美不只是漂亮。",
            "category": "aesthetic_judgment",
            "length_target": "short",
            "evidence_policy": "bounded",
        }
        encoded = controller.encode_masked_row(row, ToyTokenizer(), 128)
        mask = encoded["loss_mask"]
        first_target = mask.index(1)
        self.assertGreater(first_target, 0)
        self.assertTrue(all(value == 0 for value in mask[:first_target]))
        self.assertTrue(any(value == 1 for value in mask))
        self.assertEqual(encoded["loss_tokens"], sum(mask))

    def test_long_prompt_preserves_assistant_target(self):
        row = {
            "input": "问题" * 200,
            "target": "答案保留。",
            "category": "abstract_value",
            "length_target": "short",
            "evidence_policy": "bounded",
        }
        encoded = controller.encode_masked_row(row, ToyTokenizer(), 64)
        self.assertEqual(len(encoded["input_ids"]), 64)
        self.assertEqual(len(encoded["target_ids"]), 64)
        self.assertEqual(len(encoded["loss_mask"]), 64)
        self.assertGreater(encoded["loss_tokens"], 0)

    def test_marker_is_single_campaign_and_consumes_to_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = (controller.ART, controller.REPORTS, controller.MARKER)
            try:
                controller.ART = Path(tmp) / "artifacts/r29a0"
                controller.REPORTS = controller.ART / "reports"
                controller.MARKER = controller.REPORTS / "campaign_marker.json"
                marker = controller.create_campaign_marker()
                consumed = controller.consume_campaign_marker()
            finally:
                controller.ART, controller.REPORTS, controller.MARKER = old
        self.assertTrue(marker["active"])
        self.assertTrue(consumed["ok"])
        self.assertEqual(consumed["active_approval_after_completion"], 0)


if __name__ == "__main__":
    unittest.main()
