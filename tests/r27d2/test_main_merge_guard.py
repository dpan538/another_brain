import unittest

from scripts.r27d2_main_merge_guard import REQUIRED_COMMANDS, audit, command_plan_status


class R27D2MainMergeGuardTests(unittest.TestCase):
    def test_command_plan_contains_required_build_and_static_gates(self):
        plan = command_plan_status()
        self.assertIn("npm run build", plan["requiredCommands"])
        self.assertIn("npm run build:vercel", plan["requiredCommands"])
        self.assertIn("npm run check:r27b0-static-budget", plan["requiredCommands"])
        self.assertIn("npm run check:r27b0-static-only", plan["requiredCommands"])
        self.assertEqual(plan["trainingCommands"], [])
        self.assertEqual(plan["requiredCommands"], REQUIRED_COMMANDS)

    def test_merge_guard_static_audit_passes_without_running_commands(self):
        report = audit(run_commands=False)
        self.assertTrue(report["ok"], report["failures"])
        self.assertFalse(report["repoBuildConfigCauseStillLikely"])
        self.assertLess(report["bundleBytes"], report["bundleBudgetBytes"])
        self.assertTrue(report["routeStatus"]["ok"])
        self.assertFalse(report["nonClaims"]["backendInference"])
        self.assertFalse(report["nonClaims"]["externalLlmApi"])
        self.assertFalse(report["nonClaims"]["doubao"])


if __name__ == "__main__":
    unittest.main()
