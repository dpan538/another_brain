import unittest

from scripts.r27d0_vercel_config_audit import audit, command_invokes_training


class R27D0VercelConfigAuditTests(unittest.TestCase):
    def test_audit_passes_for_static_vercel_delivery(self):
        report = audit()
        self.assertTrue(report["ok"], report["failures"])
        self.assertEqual(report["packageScripts"]["build"], "npm run build:vercel")
        self.assertEqual(report["vercel"]["buildCommand"], "npm run build:vercel")
        self.assertEqual(report["vercel"]["outputDirectory"], "web")
        self.assertFalse(report["vercel"]["functionsConfigured"])
        self.assertFalse(report["backendInference"]["inferenceSurfaces"])
        self.assertFalse(report["trackedHygiene"]["trackedFailures"])
        self.assertFalse(report["trackedHygiene"]["changedAgainstMainFailures"])

    def test_training_command_detector_catches_deploy_unsafe_commands(self):
        unsafe = [
            "npm run train:tokenizer-dryrun",
            "python3 scripts/r27a6_run_autonomous_campaign.py --allow-training",
            "node scripts/r25b_training_pack.mjs --allow-product-model-training",
        ]
        for command in unsafe:
            with self.subTest(command=command):
                self.assertTrue(command_invokes_training(command))

    def test_training_command_detector_allows_static_vercel_build(self):
        command = "node scripts/prepare_vercel_static_build.mjs && npm run check:knowledge-runtime && npm run check:vercel-build"
        self.assertFalse(command_invokes_training(command))


if __name__ == "__main__":
    unittest.main()
