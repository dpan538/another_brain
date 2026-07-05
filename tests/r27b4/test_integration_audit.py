import unittest

from scripts.r27b4_integration_audit import audit


class R27B4IntegrationAuditTests(unittest.TestCase):
    def test_integration_audit_sees_b_components(self):
        report = audit(run_build=False, run_routine_gates=False, run_candidate_smoke=False)
        self.assertTrue(report["ok"], report["failures"])
        for key in (
            "b0_shell",
            "b1a_export_interfaces",
            "b1b_runtime",
            "b1c_deployment_rehearsal",
            "b2_candidate_injection",
            "b3_static_rag",
        ):
            self.assertTrue(report["components"][key]["present"], key)
        self.assertTrue(report["package_scripts_not_recursive"]["ok"])
        self.assertEqual(report["product_model"], False)


if __name__ == "__main__":
    unittest.main()
