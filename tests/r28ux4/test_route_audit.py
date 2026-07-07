import unittest

from scripts.r28ux4_route_audit import build_route_audit_report


class R28UX4RouteAuditTest(unittest.TestCase):
    def test_route_audit_passes(self):
        report = build_route_audit_report(write=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["root"]["redirect_target"], "/another_brain_chat/")
        self.assertTrue(report["chat"]["contains_process_panel"])


if __name__ == "__main__":
    unittest.main()
