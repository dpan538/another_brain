import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R27B1CVercelStaticRehearsalTests(unittest.TestCase):
    def test_vercel_static_rehearsal_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r27b1c_vercel_rehearsal.py"],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"], report["failures"])
        self.assertTrue(report["vercel_static_safe"], report["failures"])
        self.assertTrue(report["route_smoke"]["ok"], report["route_smoke"])
        self.assertEqual(report["chat_route"], "/another_brain_chat/")


if __name__ == "__main__":
    unittest.main()
