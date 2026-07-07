import unittest

from scripts.r28pr0_select_preview_branch import R28D7, R28ROUT0, choose_preview_branch


class R28PR0PreviewBranchSelectionTests(unittest.TestCase):
    def test_prefers_rout0_when_present_and_gate_passes(self):
        report = choose_preview_branch({R28ROUT0: True, R28D7: True}, {"ok": True})
        self.assertTrue(report["ok"])
        self.assertEqual(report["selected_base"], R28ROUT0)
        self.assertEqual(report["fallback_reason"], "")

    def test_falls_back_to_d7_when_rout0_gate_fails(self):
        report = choose_preview_branch({R28ROUT0: True, R28D7: True}, {"ok": False, "failures": ["test:r28rout0"]})
        self.assertTrue(report["ok"])
        self.assertEqual(report["selected_base"], R28D7)
        self.assertEqual(report["fallback_reason"], "r28rout0_gate_failed")

    def test_uses_d7_when_rout0_missing(self):
        report = choose_preview_branch({R28ROUT0: False, R28D7: True})
        self.assertTrue(report["ok"])
        self.assertEqual(report["selected_base"], R28D7)
        self.assertEqual(report["fallback_reason"], "r28rout0_missing")

    def test_blocks_when_no_preview_branch_exists(self):
        report = choose_preview_branch({R28ROUT0: False, R28D7: False})
        self.assertFalse(report["ok"])
        self.assertEqual(report["blocker"], "BLOCK_NO_PREVIEW_BRANCH")


if __name__ == "__main__":
    unittest.main()
