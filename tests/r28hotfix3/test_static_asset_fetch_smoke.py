import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R28Hotfix3StaticAssetFetchSmokeTest(unittest.TestCase):
    def test_static_asset_fetch_smoke_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r28hotfix3_static_asset_fetch_smoke.py"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"])
        self.assertEqual(len(report["checked_shards"]), 5)
        self.assertFalse(report["asset_probe_failed"])
        self.assertTrue(report["q4_self_check_can_move_beyond_quick_check"])


if __name__ == "__main__":
    unittest.main()
