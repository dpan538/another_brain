import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B5StaticOnlyTests(unittest.TestCase):
    def test_static_only_gate_still_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27b0_check_static_only.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertIn("passed", result.stdout)


if __name__ == "__main__":
    unittest.main()
