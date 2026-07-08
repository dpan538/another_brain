import unittest

from scripts.r28livefix0_branch_marker_audit import branch_marker_audit


class R28Livefix0BranchMarkerAuditTests(unittest.TestCase):
    def test_branch_marker_audit_passes_for_root_and_chat_entries(self):
        report = branch_marker_audit(write_report=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["marker"], "R28LIVEFIX0")
        self.assertIn("/", report["routes_checked"])
        self.assertIn("/another_brain_chat", report["routes_checked"])


if __name__ == "__main__":
    unittest.main()
