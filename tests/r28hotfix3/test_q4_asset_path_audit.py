import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class R28Hotfix3AssetPathAuditTest(unittest.TestCase):
    def test_audit_script_passes_and_reports_normalized_paths(self):
        result = subprocess.run(
            ["python3", "scripts/r28hotfix3_q4_asset_path_audit.py"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"])
        self.assertEqual(report["asset_manifest_shard_count"], 5)
        self.assertTrue(report["normalized_examples"]["first_shard"].startswith("/another_brain/"))
        self.assertTrue(report["runtime_uses_same_origin_normalizer"])


if __name__ == "__main__":
    unittest.main()
