import subprocess
import unittest
from pathlib import Path

from scripts.r27b1a_common import ROOT, ensure_no_export_assets_tracked


class R27B1ANoExportedAssetsCommittedTests(unittest.TestCase):
    def test_no_exported_assets_are_tracked(self):
        self.assertEqual(ensure_no_export_assets_tracked(), [])

    def test_gitignore_blocks_r27b1a_artifacts_and_onnx(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("artifacts/r27b1a/", gitignore)
        self.assertIn("**/*.onnx", gitignore)
        result = subprocess.run(
            ["git", "check-ignore", "artifacts/r27b1a/exported_model/model.onnx"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("artifacts/r27b1a", result.stdout)


if __name__ == "__main__":
    unittest.main()
