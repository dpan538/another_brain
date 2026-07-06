import unittest

from scripts.r27d3_integration_audit import audit


class R27D3UnifiedStaticDeliveryTests(unittest.TestCase):
    def test_unified_static_delivery_audit_passes(self):
        report = audit(run_commands=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertLess(report["bundle"]["build_output_bytes"], report["bundle"]["max_total_static_bytes"])
        self.assertTrue(report["routes"]["ok"])
        self.assertEqual(report["artifacts"]["badTrackedFiles"], [])

    def test_integrated_branch_surfaces_are_present(self):
        report = audit(run_commands=False)
        for branch in ("d2", "c0", "b8", "e0", "b5"):
            self.assertTrue(report["branchFiles"][branch]["ok"], branch)
        self.assertTrue(report["adapterSmoke"]["imported_ok"])
        self.assertTrue(report["assetCacheSmoke"]["hit"])
        self.assertGreater(report["staticRagSmoke"]["record_count"], 0)
        self.assertTrue(report["acceptanceSmoke"]["ok"])

    def test_minimal_b7_style_status_ui_is_present(self):
        report = audit(run_commands=False)
        for marker in (
            "localOnlyBadge",
            "modelMode",
            "ragMode",
            "assetCacheStatus",
            "adapterStatus",
            "budgetStatus",
            "nonProductWarning",
            "fallbackReason",
            "evidenceDrawer",
            "contextImportPanel",
            "mobileLayout",
        ):
            self.assertTrue(report["ui"][marker], marker)

    def test_non_claims_remain_false(self):
        report = audit(run_commands=False)
        for value in report["nonClaims"].values():
            self.assertFalse(value)


if __name__ == "__main__":
    unittest.main()
