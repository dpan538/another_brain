import unittest

from scripts.r28hotfix1_route_loop_audit import build_route_loop_audit


class R28Hotfix1RouteLoopAuditTest(unittest.TestCase):
    def test_route_loop_audit_passes(self):
        report = build_route_loop_audit(write=False)
        self.assertTrue(report["ok"], report["failures"])
        for route in ["/", "/another_brain_chat", "/another_brain_chat/"]:
            self.assertEqual(report["routes"][route]["redirect_count"], 0)
            self.assertTrue(report["routes"][route]["contains_hotfix1"])


if __name__ == "__main__":
    unittest.main()
