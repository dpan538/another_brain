import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "artifacts" / "r28hotfix4" / "reports" / "open_question_pipeline_audit.json"


class R28Hotfix4OpenQuestionPipelineAuditTest(unittest.TestCase):
    def test_audit_generates_pass_report(self):
        result = subprocess.run(
            [sys.executable, "scripts/r28hotfix4_open_question_pipeline_audit.py"],
            cwd=ROOT,
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(REPORT.exists())
        payload = json.loads(REPORT.read_text(encoding="utf-8"))
        self.assertEqual(payload["status"], "pass")
        self.assertTrue(all(payload["checks"].values()))
        self.assertEqual(len(payload["test_inputs"]), 5)
        self.assertIn("q4 attempt when ready", payload["pipeline"])
        self.assertIn("data/public_ingestion", payload["forbidden_scope_not_read"])


if __name__ == "__main__":
    unittest.main()
