import unittest
from pathlib import Path
from scripts.r29a8_run_foundation_preflight import POLICY


class FoundationPreflightTests(unittest.TestCase):
    def test_preflight_is_bounded_and_not_admission(self):
        self.assertEqual(POLICY["max_optimizer_tokens"], 120_000)
        self.assertFalse(POLICY["product_model_admission"])
        self.assertFalse(POLICY["allow_weight_commit"])

    def test_script_bootstraps_repository_import_path(self):
        source = Path("scripts/r29a8_run_foundation_preflight.py").read_text(encoding="utf-8")
        self.assertIn("sys.path.insert(0", source)

    def test_preflight_saves_only_an_isolated_checkpoint(self):
        source = Path("scripts/r29a8_run_foundation_preflight.py").read_text(encoding="utf-8")
        self.assertIn('"checkpoints" / f"{args.campaign_id}_last.pt"', source)
        self.assertIn('"product_model_admission": False', source)
