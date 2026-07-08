import json
import unittest

from scripts.r28stab0_runtime_soak import build_runtime_soak_report
from scripts.r28stab0_static_route_matrix import ROUTES, build_static_route_matrix


class R28Stab0RuntimeSoakTest(unittest.TestCase):
    def test_static_route_matrix_passes(self):
        report = build_static_route_matrix(write=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["route_list"], ROUTES)
        for route, record in report["routes"].items():
            self.assertEqual(record["status"], 200, route)
            self.assertLessEqual(record["redirect_count"], 1, route)
            self.assertTrue(record["desktop_viewport_ready"], route)
            self.assertTrue(record["mobile_viewport_ready"], route)

    def test_runtime_soak_schema_without_heavy_q4(self):
        report = build_runtime_soak_report(write=False, run_q4=False)
        encoded = json.dumps(report, ensure_ascii=False)
        for key in [
            "routes_passed",
            "self_check_nonblocking",
            "self_check_timeout_recovery",
            "q4_assets_fetch",
            "q4_forward_pass",
            "tokens_generated_min",
            "identity_route_fast",
            "greeting_route_fast",
            "fallback_recovery",
            "console_fatal_errors",
            "ui_freeze_detected",
            "open_blockers",
        ]:
            self.assertIn(key, report)
        self.assertTrue(report["routes_passed"])
        self.assertTrue(report["q4_assets_fetch"])
        self.assertTrue(report["identity_route_fast"])
        self.assertTrue(report["greeting_route_fast"])
        self.assertIn("no external LLM API", encoded)
        self.assertIn("not product admission", encoded)


if __name__ == "__main__":
    unittest.main()
