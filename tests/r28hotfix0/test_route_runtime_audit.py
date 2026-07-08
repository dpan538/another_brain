import unittest

from scripts.r28hotfix0_route_runtime_audit import build_route_runtime_audit


class R28Hotfix0RouteRuntimeAuditTest(unittest.TestCase):
    def test_route_runtime_audit_passes(self):
        report = build_route_runtime_audit()
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["routes"]["/another_brain_chat/"], "web/another_brain_chat/index.html")
        self.assertGreaterEqual(report["assets"]["shard_count"], 5)


if __name__ == "__main__":
    unittest.main()
