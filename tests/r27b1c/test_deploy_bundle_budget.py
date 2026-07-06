import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CDeployBundleBudgetTests(unittest.TestCase):
    def test_deploy_bundle_budget_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27b1c_verify_deploy_bundle.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"], report["failures"])
        self.assertLessEqual(report["build_output_bytes"], report["max_total_static_bytes"])
        self.assertEqual(report["chat_route"], "/another_brain_chat/")
        self.assertEqual(report["model_assets_declared"], 0)
        self.assertEqual(report["tokenizer_assets_declared"], 0)


if __name__ == "__main__":
    unittest.main()
