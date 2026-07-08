import tempfile
import unittest
from pathlib import Path

from src.training.campaign import r28a13_controller as controller


class R28A13CampaignPolicyTests(unittest.TestCase):
    def test_policy_is_bounded_non_product_sft(self):
        policy = controller.CAMPAIGN_POLICY
        self.assertEqual(policy["campaign_type"], "bounded_sft_recovery")
        self.assertFalse(policy["product_training"])
        self.assertFalse(policy["formal_decoder_training"])
        self.assertFalse(policy["phase_4"])
        self.assertEqual(policy["minimum_optimizer_tokens_before_metric_stop"], 2_000_000)
        self.assertEqual(policy["max_optimizer_tokens"], 8_000_000)
        self.assertEqual(policy["max_segments"], 6)
        self.assertEqual(policy["active_approval_after_completion"], 0)

    def test_marker_consumes_to_zero_active_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.ART, controller.REPORTS, controller.MARKER, controller.LEDGER)
            try:
                controller.ROOT = root
                controller.ART = root / "artifacts/r28a13"
                controller.REPORTS = controller.ART / "reports"
                controller.MARKER = controller.REPORTS / "campaign_marker.json"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                marker = controller.create_campaign_marker(controller.CAMPAIGN_ID)
                report = controller.consume_campaign_marker(controller.CAMPAIGN_ID)
            finally:
                controller.ROOT, controller.ART, controller.REPORTS, controller.MARKER, controller.LEDGER = old
        self.assertTrue(marker["active"])
        self.assertTrue(report["ok"])
        self.assertEqual(report["active_approval_after_completion"], 0)

    def test_blocked_ledger_never_claims_product(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = (controller.ROOT, controller.ART, controller.REPORTS, controller.LEDGER)
            try:
                controller.ROOT = root
                controller.ART = root / "artifacts/r28a13"
                controller.REPORTS = controller.ART / "reports"
                controller.LEDGER = controller.REPORTS / "campaign_ledger.json"
                ledger = controller._blocked_ledger(controller.CAMPAIGN_ID, ["test_blocker"], "new_96m")
            finally:
                controller.ROOT, controller.ART, controller.REPORTS, controller.LEDGER = old
        self.assertFalse(ledger["training_ran"])
        self.assertFalse(ledger["product_training"])
        self.assertFalse(ledger["product_model_admission"])
        self.assertFalse(ledger["release_checkpoint"])
        self.assertEqual(ledger["active_approval_after_completion"], 0)

    def test_probe_quality_blockers_mark_not_admission_ready(self):
        candidate_eval = {
            "probes": [
                {
                    "id": "beauty",
                    "output": "用户:美不是单纯好看。",
                    "score": {"expected_hits": 1, "score": 0.85},
                },
                {
                    "id": "life_death",
                    "output": "材料冲突时先说冲突。",
                    "score": {"expected_hits": 0, "score": 0.55},
                },
            ]
        }
        blockers = controller._probe_quality_blockers(candidate_eval)
        self.assertIn("probe_role_prefix_leak:beauty", blockers)
        self.assertIn("probe_expected_terms_missing:life_death", blockers)
        self.assertIn("probe_quality_below_threshold:life_death", blockers)


if __name__ == "__main__":
    unittest.main()
