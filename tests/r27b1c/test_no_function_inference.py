import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CNoFunctionInferenceTests(unittest.TestCase):
    def test_rehearsal_reports_no_backend_inference(self):
        result = subprocess.run(
            ["python3", "scripts/r27b1c_vercel_rehearsal.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"], report["failures"])
        self.assertTrue(report["no_backend_inference"], report["failures"])


if __name__ == "__main__":
    unittest.main()
