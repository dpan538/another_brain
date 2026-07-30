import unittest

from src.training.campaign.duration_audit_v2 import audit_r27a7_duration_tokens
from src.training.campaign.token_accounting_v2 import optimizer_tokens_for_run, summarize_token_accounting


class A7DurationTokenAuditTests(unittest.TestCase):
    def test_a7_18m_is_not_optimizer_tokens(self):
        report = audit_r27a7_duration_tokens()
        self.assertEqual(report["planned_tokens"], 18_000_000)
        self.assertEqual(report["optimizer_tokens"], 5_324_800)
        self.assertEqual(report["token_accounting_trust"], "low")
        self.assertEqual(report["suspected_issue"], "planned_token_count_used")
        self.assertFalse(report["r27a7_tokens_are_optimizer_consumed"])

    def test_optimizer_token_formula(self):
        self.assertEqual(optimizer_tokens_for_run(5200, 256, 4), 5_324_800)
        summary = summarize_token_accounting(18_000_000, 18_000_000, 5_324_800, 5200, 587.269)
        self.assertEqual(summary.suspected_issue, "planned_token_count_used")


if __name__ == "__main__":
    unittest.main()
