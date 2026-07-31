import unittest
from scripts.r29a8_run_foundation_preflight import POLICY


class FoundationPreflightTests(unittest.TestCase):
    def test_preflight_is_bounded_and_not_admission(self):
        self.assertEqual(POLICY["max_optimizer_tokens"], 120_000)
        self.assertFalse(POLICY["product_model_admission"])
        self.assertFalse(POLICY["allow_weight_commit"])
