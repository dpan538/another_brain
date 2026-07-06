import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B2BrowserLoaderSmokeTests(unittest.TestCase):
    def test_browser_loader_smoke_passes_with_synthetic_manifest(self):
        result = subprocess.run(
            ["python3", "scripts/r27b2_browser_loader_smoke.py", "--synthetic-if-missing"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"], report["failures"])
        self.assertTrue(report["same_origin_paths_verified"])
        self.assertTrue(report["checksums_verified"])
        self.assertEqual(report["generation_mode"], "synthetic_fallback")


if __name__ == "__main__":
    unittest.main()
