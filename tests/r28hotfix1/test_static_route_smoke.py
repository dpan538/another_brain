import unittest

from scripts.r28hotfix1_static_route_smoke import build_static_route_smoke


class R28Hotfix1StaticRouteSmokeTest(unittest.TestCase):
    def test_static_route_smoke_passes(self):
        report = build_static_route_smoke(write=False)
        self.assertTrue(report["ok"], report["failures"])
        for route, record in report["routes"].items():
            self.assertEqual(record["status"], 200, route)
            self.assertLessEqual(record["redirect_count"], 1, route)
            self.assertTrue(record["contains_hotfix1"], route)
            self.assertTrue(record["contains_process"], route)


if __name__ == "__main__":
    unittest.main()
