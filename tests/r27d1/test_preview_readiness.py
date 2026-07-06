import unittest

from scripts.r27d0_vercel_config_audit import command_invokes_training
from scripts.r27d1_preview_readiness import audit


class R27D1PreviewReadinessTests(unittest.TestCase):
    def test_preview_readiness_passes(self):
        report = audit()
        self.assertTrue(report["ok"], report["failures"])
        self.assertTrue(report["d0AuditOk"])
        self.assertEqual(report["packageScripts"]["build"], "npm run build:vercel")
        self.assertEqual(report["vercel"]["buildCommand"], "npm run build:vercel")
        self.assertEqual(report["vercel"]["outputDirectory"], "web")
        self.assertGreater(report["bundle"]["build_output_bytes"], 0)
        self.assertLess(report["bundle"]["build_output_bytes"], report["bundle"]["max_total_static_bytes"])
        self.assertEqual(report["assetManifest"]["modelDeclaredBytes"], 0)
        self.assertEqual(report["assetManifest"]["tokenizerDeclaredBytes"], 0)
        self.assertTrue(report["assetManifest"]["ragDemoDeclared"])
        self.assertEqual(report["artifacts"]["badTrackedFiles"], [])

    def test_expected_static_routes_are_ready(self):
        report = audit()
        routes = {item["route"]: item for item in report["routes"]["routes"]}
        for route in ("/", "/another_brain_chat/", "/another_brain_chat/browser_runtime.js"):
            self.assertIn(route, routes)
            self.assertEqual(routes[route]["status"], 200)
            self.assertEqual(routes[route]["missing_markers"], [])

    def test_build_path_training_detector_still_blocks_training_commands(self):
        self.assertTrue(command_invokes_training("npm run train:tokenizer-dryrun"))
        self.assertFalse(
            command_invokes_training(
                "node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build"
            )
        )


if __name__ == "__main__":
    unittest.main()
