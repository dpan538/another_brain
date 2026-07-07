import json
import subprocess
import unittest


class R28Hotfix2SelfCheckAuditTest(unittest.TestCase):
    def test_selfcheck_audit_passes(self):
        result = subprocess.run(
            ["python3", "scripts/r28hotfix2_selfcheck_audit.py"],
            check=True,
            capture_output=True,
            text=True,
        )
        report = json.loads(result.stdout)
        self.assertTrue(report["ok"])
        self.assertEqual(report["failures"], [])


if __name__ == "__main__":
    unittest.main()
